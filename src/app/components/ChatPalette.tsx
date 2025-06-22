import "./ChatPalette/style.css";
import React, { startTransition, useCallback } from "react";
import useSWRInfinite from "swr/infinite";
import { ApiError, ChatResponse, CreateChatRequest, CreateChatResponse, GetChatsResponse } from "../../internal-lib/types/api";
import { useEffect, useRef, useState, useMemo } from "react";
import { addAndSaveTabsLocally } from "../lib/utils/localStorageTabs";
import { useRouter } from "next/navigation";
import { format, isToday, isYesterday, isThisWeek, formatRelative } from "date-fns";
import isNestedButton from "../lib/utils/isNestedButton";
import ChatItem from "./ChatPalette/ChatItem";
import { Key } from "../lib/types/keyboardInput";
import { useInView } from 'react-intersection-observer';

interface ChatPaletteProps {
    className?: string;
    hidden?: boolean;
    onDismiss: () => void;
}

// Local constants
export const PINNED_SECTION = "📌 Pinned";
// Animation duration in ms (should match CSS)
const DELETE_ANIMATION_DURATION = 250; // ms
const LONG_PRESS_DURATION = 500; // ms


// Fetch chats
// Helper to group chats by date section
export function getSectionLabel(date: number) {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, "EEEE"); // Weekday name
    return formatRelative(date, "MM/dd/yyyy"); // Fallback to date
}

// Extracted function to group and sort chats into sections
function parseChatsWithSections(data: GetChatsResponse) {
    const chatsWithSections = new Map<string, ChatResponse[]>();
    data.chats.forEach(chat => {
        const date = chat.createdAt ?? Date.now();
        const section = !chat.pinned ? getSectionLabel(date) : PINNED_SECTION;
        if (!chatsWithSections.has(section)) {
            chatsWithSections.set(section, []);
        }
        chatsWithSections.get(section)?.push(chat);
    });

    // Sort sections by pinned first, then by date
    const sortedSections = new Map<string, ChatResponse[]>(
        [...chatsWithSections.entries()].sort((a, b) => {
            if (a[0] === PINNED_SECTION) return -1; // Pinned section first
            if (b[0] === PINNED_SECTION) return 1;
            const aDate = a[1][0].createdAt ?? Date.now();
            const bDate = b[1][0].createdAt ?? Date.now();
            return bDate - aDate; // Sort by date descending
        })
    );

    return {
        chats: sortedSections,
        total: data.total,
        page: data.page,
        limit: data.limit,
        hasMore: data.hasMore,
    };
}

export default function ChatPalette({ className, hidden: hiddenOuter, onDismiss }: ChatPaletteProps) {
    const { ref, inView } = useInView();

    const [loadingMore, setLoadingMore] = useState(false);
    const { data: paginatedData, isLoading, isValidating, mutate, size, setSize } = useSWRInfinite((pageIndex: number, previousPageData) => {
        if (previousPageData && !previousPageData.hasMore) return null; // No more pages to load
        const page = pageIndex + 1;
        return `/api/chat?page=${page}&limit=10`; // Adjust limit as needed
    }, async (url: string) => {
        const res = await fetch(url, {
            cache: "no-cache",
            next: { revalidate: 0 },
        });
        if (!res.ok) {
            try {
                const errorData = await res.json() as ApiError;
                throw new Error(errorData.error || "Failed to fetch chats");
            } catch (error) {
                throw new Error("Failed to fetch chats");
            }
        }

        // Parse response data
        const data = await res.json() as GetChatsResponse;
        return parseChatsWithSections(data);
    }, {
        revalidateOnMount: true,
        revalidateOnReconnect: true,
    });

    const data = useMemo(() => {
        if (!paginatedData) return undefined;
        // Merge all pages' chats into a single Map with sections
        const mergedChats = new Map<string, ChatResponse[]>();
        let total = 0, page = 1, limit = 0, hasMore = false;
        paginatedData.forEach(pageData => {
            if (!pageData) return;
            pageData.chats.forEach((chats, section) => {
                if (!mergedChats.has(section)) {
                    mergedChats.set(section, []);
                }
                mergedChats.get(section)!.push(...chats);
            });
            total = pageData.total;
            page = pageData.page;
            limit = pageData.limit;
            hasMore = pageData.hasMore;
        });
        // Resort sections: pinned first, then by date
        const sortedSections = new Map(
            [...mergedChats.entries()].sort((a, b) => {
                if (a[0] === PINNED_SECTION) return -1;
                if (b[0] === PINNED_SECTION) return 1;
                const aDate = a[1][0]?.createdAt ?? Date.now();
                const bDate = b[1][0]?.createdAt ?? Date.now();
                return bDate - aDate;
            })
        );
        return { chats: sortedSections, total, page, limit, hasMore };
    }, [paginatedData]);

    const [hidden, setHidden] = useState(hiddenOuter);
    // [[sectionIndex, chatIndex], movementDirection]
    const [selected, setSelected] = useState<[[number, number], number]>([[0, 0], 0]);
    // [[sectionIndex, chatIndex], movementDirection]
    const lastSelectedRef = useRef<[[number, number], number]>([[0, 0], 0]);
    const searchRef = useRef<HTMLInputElement>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const highlightRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const chatItemRefs = useRef<(HTMLLIElement | null)[]>([]);

    // Renaming
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [newChatTitle, setNewChatTitle] = useState<string | null>(null);
    // Deleting
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const pendingDeleteTimeout = useRef<NodeJS.Timeout | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
    // Touch handling (Bulk delete)
    const [longPressActive, setLongPressActive] = useState<string | null>(null);
    const [bulkSelectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
    const lastSelectedBulkChatRef = useRef<string | null>(null);
    const touchStartRef = useRef<{ chatId: string; startTime: number } | null>(null);
    const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // OS awareness for shortcuts
    const isTouchDevice = useMemo(() => "ontouchstart" in window || navigator.maxTouchPoints > 0, []);
    const chatPaletteShortcut = useMemo(() => {
        if (isTouchDevice) return "";
        return typeof window !== "undefined" ? window.navigator.userAgent.toLowerCase().includes("mac") ? "⌘ K" : "Ctrl + K" : "";
    }, [isTouchDevice]);

    const filteredChats = useMemo(() => {
        if (!data || !data.chats) return data?.chats || new Map<string, ChatResponse[]>();
        if (!searchQuery.trim()) return data.chats;
        const query = searchQuery.toLowerCase();
        const filtered = new Map<string, ChatResponse[]>();
        data.chats.forEach((chats, section) => {
            const filteredChats = chats.filter(chat => {
                const titleMatch = chat.label?.toLowerCase().includes(query) || false;
                const modelMatch = chat.model.toLowerCase().includes(query);
                const providerMatch = chat.provider.toLowerCase().includes(query);
                return titleMatch || modelMatch || providerMatch;
            });
            if (filteredChats.length > 0) {
                filtered.set(section, filteredChats);
            }
        });
        return filtered;
    }, [data, searchQuery]);

    useEffect(() => {
        setHidden(hiddenOuter);
        if (!hiddenOuter) {
            mutate(paginatedData, { optimisticData: paginatedData, revalidate: true });
        }
    }, [hiddenOuter, paginatedData, mutate]);

    useEffect(() => {
        if (inView && !isValidating && !loadingMore && data?.hasMore) {
            setLoadingMore(true);
            setSize((prevSize) => prevSize + 1).finally(() => {
                setLoadingMore(false);
            });
            console.log("Loading more chats...");
        }
    }, [inView, isValidating, loadingMore, setSize, data?.hasMore]);

    const keyboardShortcutHandler = useCallback(async (e: KeyboardEvent) => {
        const key = e.key as Key;

        // Movement shortcuts
        if (!e.altKey && !e.ctrlKey && !e.metaKey && key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();

            const isFaster = e.shiftKey;
            const currentSectionIndex = selected[0][0];
            const currentIndex = selected[0][1];

            let hasWrappedAround = false;

            const sectionKeys = Array.from(filteredChats.keys());
            let nextSectionIndex = currentSectionIndex;
            let nextIndex = currentIndex;

            if (!isFaster) {
                // Move up by 1
                nextIndex = currentIndex - 1;
                if (nextIndex < 0) {
                    nextSectionIndex = currentSectionIndex - 1;
                    if (nextSectionIndex < 0) {
                        nextSectionIndex = sectionKeys.length - 1;
                        hasWrappedAround = true;
                    }
                    const prevSectionChats = filteredChats.get(sectionKeys[nextSectionIndex]) || [];
                    nextIndex = prevSectionChats.length - 1;
                }
            } else {
                // Move up by 5 (across sections if needed), but do not wrap around
                let remaining = 5;
                let tempSectionIndex = currentSectionIndex;
                let tempIndex = currentIndex;
                while (remaining > 1) {
                    if (tempIndex - remaining >= 0) {
                        tempIndex -= remaining;
                        remaining = 0;
                    } else {
                        remaining -= (tempIndex + 1);
                        tempSectionIndex -= 1;
                        if (tempSectionIndex < 0) {
                            // Stop at the first item, do not wrap
                            tempSectionIndex = 0;
                            tempIndex = 0;
                            break;
                        }
                        const prevSectionChats = filteredChats.get(sectionKeys[tempSectionIndex]) || [];
                        tempIndex = prevSectionChats.length - 1;
                    }
                }
                // For shift+up, do not wrap, so hasWrappedAround is always false
                nextSectionIndex = tempSectionIndex;
                nextIndex = tempIndex;
            }

            setSelected([[nextSectionIndex, nextIndex], !hasWrappedAround ? 1 : -1]);
        }
        if (!e.altKey && !e.ctrlKey && !e.metaKey && key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();

            const isFaster = e.shiftKey;
            const currentSectionIndex = selected[0][0] || 0;
            const currentIndex = selected[0][1];

            let hasWrappedAround = false;

            const sectionKeys = Array.from(filteredChats.keys());
            let nextSectionIndex = currentSectionIndex;
            let nextIndex = currentIndex;

            if (!isFaster) {
                // Move down by 1
                nextIndex = currentIndex + 1;
                const sectionLength = filteredChats.get(sectionKeys[currentSectionIndex])!.length;
                if (nextIndex >= sectionLength) {
                    nextSectionIndex = currentSectionIndex + 1;
                    if (nextSectionIndex >= sectionKeys.length) {
                        // Don't wrap around if we're loading more data or if there's more data to load
                        if (loadingMore || data?.hasMore) {
                            nextSectionIndex = sectionKeys.length - 1;
                            nextIndex = sectionLength - 1;
                            hasWrappedAround = false;
                        } else {
                            nextSectionIndex = 0;
                            nextIndex = 0;
                            hasWrappedAround = true;
                        }
                    } else {
                        nextIndex = 0;
                    }
                }
            } else {
                // Move down by 5 (across sections if needed), but do not wrap around
                let remaining = 5;
                let tempSectionIndex = currentSectionIndex;
                let tempIndex = currentIndex;
                while (remaining > 1) {
                    const sectionLength = filteredChats.get(sectionKeys[tempSectionIndex])!.length;
                    const itemsLeftInSection = sectionLength - tempIndex - 1;
                    if (remaining <= itemsLeftInSection) {
                        tempIndex += remaining;
                        remaining = 0;
                    } else {
                        remaining -= itemsLeftInSection + 1;
                        tempSectionIndex += 1;
                        if (tempSectionIndex >= sectionKeys.length) {
                            // Stop at the last item, do not wrap
                            tempSectionIndex = sectionKeys.length - 1;
                            tempIndex = filteredChats.get(sectionKeys[tempSectionIndex])!.length - 1;
                            break;
                        }
                        tempIndex = 0;
                    }
                }
                nextSectionIndex = tempSectionIndex;
                nextIndex = tempIndex;
                // For shift+down, do not wrap, so hasWrappedAround is always false
            }

            setSelected([[nextSectionIndex, nextIndex], !hasWrappedAround ? -1 : 1]);

            // Preemptive loading when approaching the end
            if (!loadingMore && data?.hasMore && !hasWrappedAround) {
                const totalItems = Array.from(filteredChats.values()).reduce((sum, chats) => sum + chats.length, 0);
                const currentFlatIndex = Array.from(filteredChats.entries())
                    .slice(0, nextSectionIndex)
                    .reduce((sum, [_, chats]) => sum + chats.length, 0) + nextIndex;

                // Load more when within 5 items of the end
                if (totalItems - currentFlatIndex <= 5) {
                    console.log("Preemptively loading more chats...");
                    setLoadingMore(true);
                    setSize((prevSize) => prevSize + 1).finally(() => {
                        setLoadingMore(false);
                    });
                }
            }
        }
        if (!e.altKey && !e.shiftKey && !e.metaKey && (key === "Home" || (e.ctrlKey && key === "ArrowUp"))) {
            e.preventDefault();
            e.stopPropagation();
            // Move to the first item in the first section
            const firstSectionKey = Array.from(filteredChats.keys())[0];
            if (firstSectionKey) {
                const firstSectionChats = filteredChats.get(firstSectionKey) || [];
                setSelected([[0, 0], 1]);
            }
        }
        if (!e.altKey && !e.shiftKey && !e.metaKey && (key === "End" || (e.ctrlKey && key === "ArrowDown"))) {
            e.preventDefault();
            e.stopPropagation();
            // Move to the last item in the last section
            const sectionKeys = Array.from(filteredChats.keys());
            if (sectionKeys.length > 0) {
                const lastSectionKey = sectionKeys[sectionKeys.length - 1];
                const lastSectionChats = filteredChats.get(lastSectionKey) || [];
                setSelected([[sectionKeys.length - 1, lastSectionChats.length - 1], -1]);
            }
        }

        if (!e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && key === "Escape") {
            e.preventDefault();
            e.stopPropagation();

            if (bulkDeleteMode) {
                // If bulk delete mode is active, exit it
                setBulkDeleteMode(false);
                setSelectedChatIds(new Set());
                lastSelectedBulkChatRef.current = null;
                return;
            }

            if (pendingDeleteId) {
                // If a chat is pending delete, cancel the pending delete
                if (pendingDeleteTimeout.current) {
                    clearTimeout(pendingDeleteTimeout.current);
                    pendingDeleteTimeout.current = null;
                }
                setPendingDeleteId(null);
                return;
            }

            if (renamingId) {
                // If renaming is active, cancel renaming
                setRenamingId(null);
                setNewChatTitle(null);
                return;
            }

            onDismiss();
            return;
        }

        if (!e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && key === "Enter") {
            if (renamingId) return;
            e.preventDefault();
            e.stopPropagation();

            if (bulkDeleteMode) {
                // If bulk delete mode is active, toggle the chat from being selected
                const currentSectionIndex = selected[0][0];
                const currentIndex = selected[0][1];
                const sectionKeys = Array.from(filteredChats.keys());
                const currentSectionKey = sectionKeys[currentSectionIndex];
                if (currentSectionKey) {
                    const chat = filteredChats.get(currentSectionKey)?.[currentIndex];
                    if (chat) {
                        setSelectedChatIds(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(chat.id)) {
                                newSet.delete(chat.id);
                            } else {
                                newSet.add(chat.id);
                            }
                            return newSet;
                        });
                    }
                }
                return;
            }

            if (pendingDeleteId) {
                // If a chat is pending delete, confirm deletion
                if (pendingDeleteTimeout.current) {
                    clearTimeout(pendingDeleteTimeout.current);
                    pendingDeleteTimeout.current = null;
                }
                handleDelete(pendingDeleteId);
                return;
            }

            if (selected[0][0] < 0 || selected[0][1] < 0) return;
            const sectionKeys = Array.from(filteredChats.keys());
            const currentSectionKey = sectionKeys[selected[0][0]];
            if (!currentSectionKey) return;
            const chat = filteredChats.get(currentSectionKey)?.[selected[0][1]];
            if (!chat) return;

            openTab(chat);
            return;
        }

        if (e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && key === "Enter") {
            if (searchQuery.trim() === "") return;
            e.preventDefault();
            e.stopPropagation();
            await createChatFromSearch();
            return;
        }


        if (!e.altKey && !e.metaKey && !e.ctrlKey && ((!e.shiftKey && key === "Delete") || (e.shiftKey && key === "Backspace"))) {
            e.preventDefault();
            e.stopPropagation();

            if (bulkDeleteMode && bulkSelectedChatIds.size > 0) {
                // handleBulkDelete();
                return;
            }

            if (selected[0][0] < 0 || selected[0][1] < 0) return;
            const sectionKeys = Array.from(filteredChats.keys());
            const currentSectionKey = sectionKeys[selected[0][0]];
            if (!currentSectionKey) return;
            const chat = filteredChats.get(currentSectionKey)?.[selected[0][1]];
            if (!chat) return;

            if (pendingDeleteId === chat.id && !deletingId) {
                if (pendingDeleteTimeout.current) {
                    clearTimeout(pendingDeleteTimeout.current);
                    pendingDeleteTimeout.current = null;
                }
                handleDelete(chat.id);
            } else if (pendingDeleteId !== chat.id) {
                setPendingDeleteId(chat.id);
                if (pendingDeleteTimeout.current) {
                    clearTimeout(pendingDeleteTimeout.current);
                }
                pendingDeleteTimeout.current = setTimeout(() => setPendingDeleteId(id => id === chat.id ? null : id), 3000);
            }
            return;
        }

        if (e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey && e.key == "r") {
            e.preventDefault();
            e.stopPropagation();

            setPendingDeleteId(null);
            if (pendingDeleteTimeout.current) clearTimeout(pendingDeleteTimeout.current);

            if (selected[0][0] < 0 || selected[0][1] < 0) return;
            const sectionKeys = Array.from(filteredChats.keys());
            const currentSectionKey = sectionKeys[selected[0][0]];
            if (!currentSectionKey) return;
            const chat = filteredChats.get(currentSectionKey)?.[selected[0][1]];
            if (!chat) return;
            setRenamingId(chat.id);
        }
    }, [onDismiss, selected, bulkDeleteMode, bulkSelectedChatIds.size, filteredChats, deletingId, pendingDeleteId, renamingId, data?.hasMore, loadingMore, searchQuery, setSize]);

    useEffect(() => {
        if (hidden) {
            lastSelectedRef.current = selected;
            setRenamingId(null);
            setNewChatTitle(null);
            setBulkDeleteMode(false);
            setPendingDeleteId(null);
            setDeletingId(null);
            setLongPressActive(null);
            setSelectedChatIds(new Set());
            lastSelectedBulkChatRef.current = null;
        }

        if (!hidden) {
            window.onkeydown = keyboardShortcutHandler;
        }

        // Dynamically set the highlight position with the --top CSS variable
        const updateHighlightPosition = () => {
            if (!highlightRef.current || !listRef.current) return;
            let totalSectionsLength = 0;
            filteredChats.entries().toArray().forEach((entry, idx) => {
                if (idx >= selected[0][0]) return;
                totalSectionsLength += entry[1].length;
            });
            const flatIndex = (selected[0][0] + totalSectionsLength + 1) + selected[0][1];
            const selectedItem = chatItemRefs.current[flatIndex];
            if (!selectedItem) return;
            const rect = selectedItem.getBoundingClientRect();
            const listRect = listRef.current.getBoundingClientRect();
            // Account for scroll position
            const scrollTop = listRef.current.scrollTop;
            const topPos = rect.top - listRect.top + scrollTop;
            highlightRef.current.style.setProperty("--top-pos", `${topPos}px`);
            highlightRef.current.style.height = `${rect.height}px`;
            if (selectedItem && listRef.current) {
                const list = listRef.current;
                const itemRect = selectedItem.getBoundingClientRect();
                const listRect = list.getBoundingClientRect();
                const scrollTop = list.scrollTop;

                if (selected[1] === -1) {
                    // Move down: keep selected item at the bottom edge
                    const offsetBottom = itemRect.bottom - listRect.bottom;
                    if (offsetBottom > 0) {
                        const newScrollTop = scrollTop + offsetBottom;
                        list.scrollTo({ top: newScrollTop, behavior: "smooth" });
                    } else if (itemRect.top < listRect.top) {
                        // If above, scroll up to top edge
                        const offsetTop = itemRect.top - listRect.top;
                        const newScrollTop = scrollTop + offsetTop;
                        list.scrollTo({ top: newScrollTop, behavior: "smooth" });
                    }
                } else if (selected[1] === 1) {
                    const previousElementIndex = selected[0][0] + totalSectionsLength + selected[0][1];
                    let previousElement: HTMLLIElement | null = null;
                    if (previousElementIndex >= 0) previousElement = chatItemRefs.current[previousElementIndex];

                    // Move up: keep selected item at the top edge
                    const offsetTop = itemRect.top - listRect.top;
                    const padding = previousElement && previousElement.classList.contains("section") ? previousElement.clientHeight : 0; // Adjust padding as needed
                    if (offsetTop < 0) {
                        const newScrollTop = scrollTop + offsetTop - padding;
                        list.scrollTo({ top: newScrollTop, behavior: "smooth" });
                    } else if (itemRect.bottom > listRect.bottom) {
                        // If below, scroll down to bottom edge
                        const offsetBottom = itemRect.bottom - listRect.bottom;
                        const newScrollTop = scrollTop + offsetBottom - padding;
                        list.scrollTo({ top: newScrollTop, behavior: "smooth" });
                    }
                }
            }
        };
        updateHighlightPosition();

        return () => {
            window.onkeydown = null;
        }
    }, [hidden, selected, data, filteredChats, mutate, keyboardShortcutHandler]);


    const router = useRouter();
    function openTab(chat: ChatResponse) {
        addAndSaveTabsLocally(localStorage, {
            id: chat.id,
            label: chat.label ?? "New Tab",
            link: `/chat/${chat.id}`
        });
        onDismiss();
        startTransition(() => {
            router.push(`/chat/${chat.id}`);
        });
    }

    const createChatFromSearch = useCallback(async () => {
        if (!searchQuery.trim()) return;
        onDismiss();
        setTimeout(() => {
            setSearchQuery("");
        }, 200);

        // If shift + enter is pressed, create a new chat with the search query as title
        const chat = await fetch("/api/chat", {
            method: "POST",
            body: JSON.stringify({
                model: "google/gemini-2.5-flash", // this should prolly not be hardcoded
                provider: "openrouter",
            } as CreateChatRequest),
        }).then(res => res.json() as Promise<CreateChatResponse | ApiError>)
            .catch(() => undefined);
        if (!chat || "error" in chat) {
            return;
        }

        sessionStorage.setItem("temp-new-tab-msg", JSON.stringify({ message: searchQuery.trim(), tabId: chat.id }));
        addAndSaveTabsLocally(localStorage, {
            id: chat.id,
            link: `/chat/${chat.id}`
        });

        startTransition(() => {
            router.push(`/chat/${chat.id}`);
        });
    }, [searchQuery, onDismiss, router]);

    function onChatClick(e: React.MouseEvent<HTMLLIElement, MouseEvent>, chat: ChatResponse) {
        if (renamingId === chat.id) return;

        // Check if it's a nested button
        const target = e.target as HTMLElement;
        if (isNestedButton(target)) return;

        if (bulkDeleteMode && !e.shiftKey) {
            e.preventDefault();
            // In bulk mode, regular click toggles selection
            setSelectedChatIds(prev => {
                const newSet = new Set(prev);
                lastSelectedBulkChatRef.current = chat.id;
                if (newSet.has(chat.id)) {
                    newSet.delete(chat.id);
                } else {
                    newSet.add(chat.id);
                }
                if (newSet.size === 0) {
                    setBulkDeleteMode(false);
                }
                return newSet;
            });
            return;
        } else if (bulkDeleteMode && e.shiftKey) {
            // Shift click in bulk mode should add all tabs from the last selected to the current one
            e.preventDefault();
            const lastSelectedId = lastSelectedBulkChatRef.current;
            if (!lastSelectedId) {
                // If no last selected, just toggle current
                setSelectedChatIds(prev => {
                    const newSet = new Set(prev);
                    newSet.add(chat.id);
                    lastSelectedBulkChatRef.current = chat.id;
                    return newSet;
                });
                return;
            }

            // Find all chat ids in order
            const allChatIds: string[] = [];
            filteredChats.forEach(chats => {
                chats.forEach(c => allChatIds.push(c.id));
            });
            const startIdx = allChatIds.indexOf(lastSelectedId);
            const endIdx = allChatIds.indexOf(chat.id);
            if (startIdx === -1 || endIdx === -1) return;
            const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            const idsToSelect = allChatIds.slice(from, to + 1);

            setSelectedChatIds(prev => {
                const newSet = new Set(prev);
                idsToSelect.forEach(id => {
                    newSet.add(id);
                });
                lastSelectedBulkChatRef.current = chat.id;
                return newSet;
            });
            return;
        }

        if (e.shiftKey) {
            e.preventDefault();
            // Toggle bulk selection mode
            setBulkDeleteMode(true);
            setSelectedChatIds(prev => {
                const newSet = new Set(prev);
                lastSelectedBulkChatRef.current = chat.id;
                if (newSet.has(chat.id)) {
                    newSet.delete(chat.id);
                } else {
                    newSet.add(chat.id);
                }
                if (newSet.size === 0) {
                    setBulkDeleteMode(false);
                }
                return newSet;
            });
        } else {
            openTab(chat);
        }
    };

    // Extracted function to update pinned status and move chat between sections
    function updatePinnedStatus(
        chatsMap: Map<string, ChatResponse[]>,
        chatId: string,
        newPinned: boolean
    ): Map<string, ChatResponse[]> {
        const updatedChats = new Map(chatsMap);
        let chatToUpdate: ChatResponse | undefined;

        // Find and remove chat from its old section
        for (const [section, chats] of updatedChats.entries()) {
            const idx = chats.findIndex(c => c.id === chatId);
            if (idx !== -1) {
                chatToUpdate = { ...chats[idx], pinned: newPinned };
                chats.splice(idx, 1);
                // Remove section if empty
                if (chats.length === 0) updatedChats.delete(section);
                break;
            }
        }

        if (!chatToUpdate) return updatedChats;

        // Determine new section
        let newSection: string;
        if (newPinned) {
            newSection = PINNED_SECTION;
        } else {
            const date = chatToUpdate.createdAt ?? Date.now();
            newSection = getSectionLabel(date);
        }

        // Add chat to new section, create section if it doesn't exist
        if (!updatedChats.has(newSection)) {
            updatedChats.set(newSection, []);
        }
        const sectionChats = updatedChats.get(newSection)!;
        sectionChats.push(chatToUpdate);
        sectionChats.sort((a, b) => (b.createdAt ?? Date.now()) - (a.createdAt ?? Date.now()));

        // Remove any empty sections (in case)
        for (const [section, chats] of updatedChats.entries()) {
            if (chats.length === 0) updatedChats.delete(section);
        }

        // Resort sections: pinned first, then by date
        const sortedSections = new Map(
            [...updatedChats.entries()].sort((a, b) => {
                if (a[0] === PINNED_SECTION) return -1;
                if (b[0] === PINNED_SECTION) return 1;
                const aDate = a[1][0].createdAt ?? Date.now();
                const bDate = b[1][0].createdAt ?? Date.now();
                return bDate - aDate;
            })
        );

        return sortedSections;
    }
    // Handle pinning/unpinning a chat
    const handlePinChat = async (chatId: string, newPinnedStatus: boolean) => {
        if (!data) return;

        const [currentSectionIndex, currentChatIndex] = selected[0];
        const currentSectionKey = Array.from(filteredChats.keys())[currentSectionIndex];
        const selectedChat = currentSectionKey ? filteredChats.get(currentSectionKey)?.[currentChatIndex] : undefined;
        const selectedChatId = selectedChat?.id;

        const newChatsMap = updatePinnedStatus(data.chats, chatId, newPinnedStatus);

        if (selectedChatId) { // This covers both cases: pinned chat is selected, or another chat is selected.
            const newSectionKeys = Array.from(newChatsMap.keys());
            let newSelectedSectionIndex = 0;
            let newSelectedChatIndex = 0;

            const found = newSectionKeys.some((section, sectionIndex) => {
                const chats = newChatsMap.get(section) || [];
                const chatIndex = chats.findIndex(c => c.id === selectedChatId);
                if (chatIndex !== -1) {
                    newSelectedSectionIndex = sectionIndex;
                    newSelectedChatIndex = chatIndex;
                    return true;
                }
                return false;
            });

            if (found) {
                setSelected([[newSelectedSectionIndex, newSelectedChatIndex], selected[1]]);
            } else {
                setSelected([[0, 0], 0]);
            }
        }

        mutate((pages) => {
            if (!pages) return pages;
            // Update the first page's chats (or whichever page contains the updated chat)
            return pages.map((page, idx) => {
                if (idx === 0 && page) {
                    return { ...page, chats: newChatsMap };
                }
                return page;
            });
        }, false);

        await fetch(`/api/chat/${chatId}`, {
            method: "POST",
            body: JSON.stringify({ pinned: newPinnedStatus }),
        });

        await mutate();
    };

    // Handle bulk delete
    const handleBulkDelete = async () => {
        if (bulkSelectedChatIds.size === 0) return;

        const chatIdsToDelete = Array.from(bulkSelectedChatIds);
        setBulkDeleteMode(false);
        setSelectedChatIds(new Set());

        // Add delete animation to all selected chats
        setDeletingId(null); // Reset before animating
        chatIdsToDelete.forEach(id => setDeletingId(id));

        setTimeout(async () => {
            try {
                const result = await fetch("/api/chat/bulk", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chatIds: chatIdsToDelete })
                }).then(res => res.json());

                if (!result.success) {
                    console.error("Bulk delete failed:", result.error);
                    setDeletingId(null);
                    return;
                }

                mutate((pages) => {
                    if (!pages) return pages;
                    // Merge all pages' chats into a single Map
                    const mergedChats = new Map<string, ChatResponse[]>();
                    let total = 0, page = 1, limit = 0, hasMore = false;
                    pages.forEach(pageData => {
                        if (!pageData) return;
                        pageData.chats.forEach((chats, section) => {
                            if (!mergedChats.has(section)) {
                                mergedChats.set(section, []);
                            }
                            mergedChats.get(section)!.push(...chats);
                        });
                        total = pageData.total;
                        page = pageData.page;
                        limit = pageData.limit;
                        hasMore = pageData.hasMore;
                    });

                    // Remove deleted chats from all sections
                    for (const [section, chats] of mergedChats.entries()) {
                        const filtered = chats.filter(c => !chatIdsToDelete.includes(c.id));
                        if (filtered.length === 0) {
                            mergedChats.delete(section);
                        } else {
                            mergedChats.set(section, filtered);
                        }
                    }

                    // Move selection if needed
                    let [sectionIdx, chatIdx] = selected[0];
                    const sectionKeys = Array.from(mergedChats.keys());
                    if (
                        sectionIdx >= sectionKeys.length ||
                        (sectionKeys[sectionIdx] &&
                            !(mergedChats.get(sectionKeys[sectionIdx])?.[chatIdx]))
                    ) {
                        // Move to first available chat
                        sectionIdx = 0;
                        chatIdx = 0;
                    }
                    setSelected([[sectionIdx, chatIdx], 0]);
                    // Dismiss palette if no chats left
                    const totalChats = Array.from(mergedChats.values()).reduce((acc, arr) => acc + arr.length, 0);
                    if (totalChats === 0) {
                        setTimeout(() => onDismiss(), 0);
                    }

                    // Return updated pages (update first page, keep others as is)
                    return pages.map((page, idx) => {
                        if (idx === 0 && page) {
                            return { ...page, chats: mergedChats };
                        }
                        return page;
                    });
                }, false);

                setDeletingId(null);
            } catch (error) {
                console.error("Failed to delete chats:", error);
                setDeletingId(null);
            }
        }, DELETE_ANIMATION_DURATION);
    };

    // Handle delete with animation
    const handleDelete = async (chatId: string) => {
        setPendingDeleteId(null);
        setDeletingId(chatId);

        // Find section and index of chat to be deleted
        let sectionIdx = -1;
        let chatIdx = -1;
        let sectionKey: string | undefined;
        const sectionKeys = Array.from(filteredChats.keys());
        sectionKeys.forEach((key, sIdx) => {
            const chats = filteredChats.get(key) || [];
            const idx = chats.findIndex(c => c.id === chatId);
            if (idx !== -1) {
                sectionIdx = sIdx;
                chatIdx = idx;
                sectionKey = key;
            }
        });

        setTimeout(async () => {
            const result = await fetch(`/api/chat/${chatId}`, { method: "DELETE" })
                .then(res => res.json() as Promise<{ success: string } | ApiError>)
                .catch(() => null);
            if (!result || "error" in result) {
                setDeletingId(null);
                return;
            }

            mutate((pages) => {
                if (!pages) return pages;
                // Merge all pages' chats into a single Map
                const mergedChats = new Map<string, ChatResponse[]>();
                pages.forEach(pageData => {
                    if (!pageData) return;
                    pageData.chats.forEach((chats, section) => {
                        if (!mergedChats.has(section)) {
                            mergedChats.set(section, []);
                        }
                        mergedChats.get(section)!.push(...chats);
                    });
                });

                // Remove chat from the correct section
                if (sectionKey) {
                    const chats = mergedChats.get(sectionKey) || [];
                    chats.splice(chatIdx, 1);
                    if (chats.length === 0) {
                        mergedChats.delete(sectionKey);
                    } else {
                        mergedChats.set(sectionKey, chats);
                    }
                }

                // Move selection if needed
                if (
                    sectionIdx === selected[0][0] &&
                    chatIdx === selected[0][1]
                ) {
                    // If last chat in section, move up, else stay at same index
                    const chatsInSection = mergedChats.get(sectionKey || "") || [];
                    let newSectionIdx = sectionIdx;
                    let newChatIdx = selected[0][1];
                    const mergedSectionKeys = Array.from(mergedChats.keys());
                    if (newChatIdx >= chatsInSection.length) {
                        newChatIdx = chatsInSection.length - 1;
                        if (newChatIdx < 0 && mergedSectionKeys.length > 1) {
                            // Move to previous section if exists
                            newSectionIdx = Math.max(0, sectionIdx - 1);
                            const prevSectionChats = mergedChats.get(mergedSectionKeys[newSectionIdx]) || [];
                            newChatIdx = prevSectionChats.length - 1;
                        }
                    }
                    setSelected([[Math.max(0, newSectionIdx), Math.max(0, newChatIdx)], 0]);
                }

                // Dismiss palette if this was the last chat
                const totalChats = Array.from(mergedChats.values()).reduce((acc, arr) => acc + arr.length, 0);
                if (totalChats === 0) {
                    setTimeout(() => onDismiss(), 0);
                }

                // Return updated pages (update first page, keep others as is)
                return pages.map((page, idx) => {
                    if (idx === 0 && page) {
                        return { ...page, chats: mergedChats };
                    }
                    return page;
                });
            }, false);

            setDeletingId(null);
            mutate(); // revalidate SWR
        }, DELETE_ANIMATION_DURATION);
    };

    return (
        <>
            <div
                className={`z-25 bg-black/15 absolute left-0 right-0 top-0 bottom-0 select-none ${hidden ? "pointer-events-none opacity-0" : "opacity-100"} backdrop-blur-xs transition-opacity duration-300`}
                onClick={() => onDismiss()}
            />
            <div className={`fixed z-50 flex flex-col items-stretch gap-5 w-8/10 max-w-[1035px] max-h-8/10 max-sm:max-h-9/10 left-1/2 top-1/2 -translate-1/2 ${hidden ? "pointer-events-none" : ""} transition-all duration-500 ease-in-out ${className}`}>
                <div
                    className={`
                    flex bg-[rgba(36,36,36,0.75)] gap-3 p-4 items-center justify-stretch pr-5
                    backdrop-blur-2xl shadow-highlight rounded-2xl cursor-text
                    transition-all duration-250
                    ${hidden ? "!bg-[rgba(36,36,36,0)] !backdrop-blur-none opacity-0" : ""}
                `}
                    onClick={() => !isTouchDevice ? searchRef.current?.focus() : {}}
                >
                    <div className="bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl flex justify-center items-center aspect-square">
                        <svg width="13" height="17" viewBox="0 0 13 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path opacity="0.9" d="M6.37204 1.29353C6.46301 0.828376 6.50849 0.595801 6.60694 0.595843C6.70538 0.595885 6.75067 0.828499 6.84124 1.29373L7.18501 3.05959C7.49945 4.67474 7.65667 5.48232 8.07585 6.12959C8.31594 6.50033 8.61602 6.82856 8.96381 7.10084C9.571 7.57622 10.3613 7.80504 11.942 8.26268C12.3106 8.36941 12.495 8.42278 12.5315 8.51159C12.5515 8.56015 12.5515 8.61464 12.5315 8.66321C12.495 8.75202 12.3107 8.80538 11.942 8.9121C10.3618 9.3696 9.57174 9.59835 8.96466 10.0736C8.61643 10.3461 8.31601 10.6748 8.07573 11.0461C7.65686 11.6933 7.49985 12.5007 7.18582 14.1156L6.84125 15.8875C6.75069 16.3532 6.7054 16.5861 6.60694 16.5861C6.50847 16.5861 6.46299 16.3533 6.37203 15.8877L6.10216 14.5062C5.71138 12.5058 5.51599 11.5056 4.92333 10.7508C4.79982 10.5935 4.66465 10.4458 4.51896 10.3088C3.81982 9.65147 2.84091 9.36806 0.883087 8.80122C0.607498 8.72143 0.469704 8.68154 0.456627 8.60844C0.454137 8.59452 0.454137 8.58027 0.456627 8.56635C0.469704 8.49325 0.607505 8.45335 0.883108 8.37356C2.84144 7.80658 3.8206 7.52309 4.51985 6.86551C4.6651 6.72892 4.79988 6.58161 4.92308 6.42483C5.51614 5.67009 5.71178 4.66971 6.10306 2.66894L6.37204 1.29353Z" fill="white" />
                        </svg>
                    </div>
                    <div className="relative w-full">
                        <label htmlFor="search" hidden={searchQuery !== ""} className="text-neutral-300/60 left-0 absolute pointer-events-none" autoCorrect="off">
                            Search your chats or press Shift+Enter to start a new one...
                        </label>
                        <input ref={searchRef} onInput={(e) => setSearchQuery(e.currentTarget.value)} value={searchQuery} autoFocus={!isTouchDevice} id="search" className="w-full outline-none text-neutral-50/80" />
                    </div>
                    <button
                        onClick={async () => {
                            await createChatFromSearch();
                            return;
                        }}
                        disabled={searchQuery.trim() === ""}
                        className="
                            bg-primary backdrop-blur-xl z-10 px-3 h-8 rounded-xl
                            min-w-fit flex items-center text-sm text-white hover:bg-primary/75 cursor-pointer
                            transition-all duration-200
                            disabled:bg-primary/50 disabled:text-white/50 disabled:cursor-not-allowed
                        "
                        style={{
                            opacity: searchQuery === "" ? 0 : 1,
                            pointerEvents: searchQuery === "" ? "none" : "auto",
                            scale: searchQuery === "" ? 0.8 : 1,
                            marginRight: searchQuery === "" ? "calc(-1 * var(--send-wdith, 0px))" : "0",
                        }}
                        ref={el => {
                            if (el) {
                                el.style.setProperty("--send-width", `${el.clientWidth + 12}px`);
                            }
                        }}
                    >
                        Send
                    </button>
                    {!isTouchDevice && (
                        <span className="bg-white/10 backdrop-blur-xl z-10 px-3 h-8 rounded-xl min-w-fit flex items-center text-sm text-neutral-200/65">
                            {chatPaletteShortcut}
                        </span>
                    )}
                </div>
                <div
                    className="flex bg-[rgba(36,36,36,0.75)] gap-3 p-4 -z-5 items-center justify-between backdrop-blur-2xl shadow-highlight rounded-2xl transition-all duration-250"
                    style={{
                        opacity: bulkDeleteMode ? 1 : 0,
                        pointerEvents: bulkDeleteMode ? "auto" : "none",
                        marginTop: bulkDeleteMode ? "0" : "calc(-1 * var(--bulk-bar-height, 0px))",
                    }}
                    ref={el => {
                        if (el) {
                            el.style.setProperty("--bulk-bar-height", `${el.clientHeight + 20}px`);
                        }
                    }}
                >
                    <div className="text-neutral-300/80 text-sm">
                        {bulkSelectedChatIds.size} chat{bulkSelectedChatIds.size !== 1 ? "s" : ""} selected
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setBulkDeleteMode(false);
                                setSelectedChatIds(new Set());
                                lastSelectedBulkChatRef.current = null;
                            }}
                            className="bg-white/10 backdrop-blur-xl px-4 py-2 rounded-xl text-sm text-neutral-200/80 hover:bg-white/20 transition-all duration-200 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            disabled={bulkSelectedChatIds.size === 0}
                            className="bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed px-4 py-2 rounded-xl text-sm text-white transition-all duration-200 cursor-pointer"
                        >
                            Delete Selected
                        </button>
                    </div>
                </div>
                <div
                    className={`
                        flex bg-[rgba(36,36,36,0.75)] items-stretch justify-stretch
                        backdrop-blur-2xl shadow-highlight rounded-2xl
                        transition-all duration-250 relative
                        min-h-0 flex-1
                        ${hidden ? "!bg-[rgba(36,36,36,0)] !backdrop-blur-none opacity-0" : ""}
                    `}
                >
                    <ul ref={listRef} className="flex flex-col items-stretch justify-stretch w-full mim-h-0 flex-1 overflow-y-auto overflow-x-clip transition-all duration-200 relative select-none">
                        {!isTouchDevice && (
                            <div
                                ref={highlightRef}
                                hidden={filteredChats.size === 0 || isLoading}
                                className="bg-white/5 w-full absolute rounded-2xl text-transparent select-none pointer-events-none shadow-highlight-sm transition-all duration-200"
                                style={{ top: `var(--top-pos, 0px)`, height: 64 }}
                            />
                        )}
                        {filteredChats.size === 0 && !isLoading && !isValidating && (
                            <li className="p-4 px-5.5 flex gap-4 min-h-[64px] items-center">
                                <span className="line-clamp-1 truncate">
                                    No chats found — create one by typing
                                </span>
                            </li>
                        )}
                        {isLoading && !isValidating && (
                            <li className="p-4 px-5.5 flex gap-4 min-h-[64px] items-center">
                                <span>Loading... please wait</span>
                            </li>
                        )}
                        <li
                            className="section px-4 pb-2 pt-2.5 text-xs text-primary-light font-semibold select-none absolute right-2 transition-all duration-200"
                            style={{
                                opacity: searchQuery === "" ? 0 : 1,
                                scale: searchQuery === "" ? 0.8 : 1,
                            }}
                        >
                            Shift + Enter to start a new chat
                        </li>
                        {filteredChats.entries().toArray().map((value, sectionIdx) => {
                            let totalSectionsLength = 0;
                            filteredChats.entries().toArray().forEach((entry, idx) => {
                                if (idx >= sectionIdx) return;
                                totalSectionsLength += entry[1].length;
                            });

                            return (
                                <React.Fragment key={value[0]}>
                                    <li
                                        ref={el => { chatItemRefs.current[sectionIdx + totalSectionsLength] = el }}
                                        className="section px-4 pb-2 pt-2.5 text-xs text-neutral-400 font-semibold select-none"
                                    >
                                        {value[0]}
                                    </li>

                                    {value[1].map((chat, chatIdx) => {
                                        const flatIdx = sectionIdx * totalSectionsLength + chatIdx;
                                        const isSelected = sectionIdx === selected[0][0] && chatIdx === selected[0][1];
                                        const isBulkSelected = bulkSelectedChatIds.has(chat.id);
                                        const isDeleting = deletingId === chat.id;
                                        const isLongPressing = longPressActive === chat.id;

                                        return (
                                            <li
                                                key={chat.id}
                                                ref={el => { chatItemRefs.current[(sectionIdx + totalSectionsLength + 1) + chatIdx] = el }}
                                                className={`
                                                    p-4 h-[64px] flex gap-4 items-center text-neutral-50/80 w-full cursor-pointer
                                                    ${isBulkSelected ?
                                                        "bg-blue-500/15" :
                                                        !isSelected ? "hover:bg-white/[0.03]" :
                                                            ""
                                                    }
                                                    transition-all duration-200 overflow-clip
                                                    ${isDeleting ? "chat-delete-anim" : ""}
                                                    ${isLongPressing ? "chat-long-press" : ""}
                                                    group

                                                    rounded-2xl
                                                    ${(() => {
                                                        // Disable top roundness if previous element is selected
                                                        const prevIsSelected = (() => {
                                                            if (!isBulkSelected) return false;
                                                            if (chatIdx === 0) return false;
                                                            const lastChatId = value[1][chatIdx - 1].id;
                                                            return bulkSelectedChatIds.has(lastChatId);
                                                        })();
                                                        return prevIsSelected ? "!rounded-b-2xl !rounded-t-none" : "";
                                                    })()}
                                                    ${(() => {
                                                        // Disable bottom roundness if next element is selected
                                                        const sectionChats = value[1];
                                                        const nextIsSelected = (() => {
                                                            if (!isBulkSelected) return false;
                                                            if (chatIdx === sectionChats.length - 1) return false;
                                                            const nextChatId = value[1][chatIdx + 1].id;
                                                            return bulkSelectedChatIds.has(nextChatId);
                                                        })();
                                                        return nextIsSelected ? "!rounded-t-2xl !rounded-b-none" : "";
                                                    })()}
                                                `}
                                                onClick={e => onChatClick(e, chat)}
                                            >
                                                <ChatItem
                                                    chat={chat}
                                                    idx={flatIdx}
                                                    section={value[0]}
                                                    isSelected={isSelected}
                                                    isBulkSelected={isBulkSelected}
                                                    bulkDeleteMode={bulkDeleteMode}
                                                    pendingDeleteId={pendingDeleteId}
                                                    onPinUpdate={handlePinChat}
                                                    renameId={renamingId}
                                                    deletingId={deletingId}
                                                    onRenameTrigger={id => {
                                                        setRenamingId(id);
                                                        setNewChatTitle(null);
                                                    }}
                                                    onRename={(newLabel, id, idx) => {
                                                        setRenamingId(null);
                                                        setNewChatTitle(null);
                                                        mutate(async pages => {
                                                            if (!pages) return pages;
                                                            // Merge all pages' chats into a single Map
                                                            const mergedChats = new Map<string, ChatResponse[]>();
                                                            pages.forEach(pageData => {
                                                                if (!pageData) return;
                                                                pageData.chats.forEach((chats, section) => {
                                                                    if (!mergedChats.has(section)) {
                                                                        mergedChats.set(section, []);
                                                                    }
                                                                    mergedChats.get(section)!.push(...chats);
                                                                });
                                                            });

                                                            // Update the chat label in the merged map
                                                            const sectionChats = mergedChats.get(value[0]) || [];
                                                            const chatToUpdate = sectionChats.find(c => c.id === id);
                                                            if (chatToUpdate) {
                                                                chatToUpdate.label = newLabel;
                                                                sectionChats[idx].label = newLabel;
                                                                mergedChats.set(value[0], sectionChats);
                                                            }

                                                            // Persist to server
                                                            const result = await fetch(`/api/chat/${id}`, {
                                                                method: "POST",
                                                                body: JSON.stringify({ label: newLabel }),
                                                            }).then(res => res.json()).catch(err => {
                                                                console.error(err);
                                                                return null;
                                                            });
                                                            if (!result || "error" in result) {
                                                                console.error("Failed to rename chat:", result?.error || "Unknown error");
                                                                return pages;
                                                            }

                                                            // Return updated pages (update first page, keep others as is)
                                                            return pages.map((page, idx) => {
                                                                if (idx === 0 && page) {
                                                                    return { ...page, chats: mergedChats };
                                                                }
                                                                return page;
                                                            });
                                                        }, {
                                                            optimisticData(currentPages, displayedPages) {
                                                                if (!currentPages) return displayedPages ?? [];
                                                                // Merge all pages' chats into a single Map
                                                                const mergedChats = new Map<string, ChatResponse[]>();
                                                                currentPages.forEach(pageData => {
                                                                    if (!pageData) return;
                                                                    pageData.chats.forEach((chats, section) => {
                                                                        if (!mergedChats.has(section)) {
                                                                            mergedChats.set(section, []);
                                                                        }
                                                                        mergedChats.get(section)!.push(...chats);
                                                                    });
                                                                });

                                                                // Update the chat label in the merged map
                                                                const sectionChats = mergedChats.get(value[0]) || [];
                                                                const chatToUpdate = sectionChats.find(c => c.id === id);
                                                                if (chatToUpdate) {
                                                                    chatToUpdate.label = newLabel;
                                                                    sectionChats[idx].label = newLabel;
                                                                    mergedChats.set(value[0], sectionChats);
                                                                }

                                                                // Return updated pages (update first page, keep others as is)
                                                                return currentPages.map((page, idx) => {
                                                                    if (idx === 0 && page) {
                                                                        return { ...page, chats: mergedChats };
                                                                    }
                                                                    return page;
                                                                });
                                                            },
                                                            revalidate: true,
                                                        });
                                                    }}
                                                    onRenameCancel={() => {
                                                        setRenamingId(null);
                                                        setNewChatTitle(null);
                                                    }}
                                                    onDeleteTrigger={id => {
                                                        setPendingDeleteId(id);
                                                        if (pendingDeleteTimeout.current) {
                                                            clearTimeout(pendingDeleteTimeout.current);
                                                        }
                                                        pendingDeleteTimeout.current = setTimeout(() => setPendingDeleteId(id => id === chat.id ? null : id), 3000);
                                                    }}
                                                    onDelete={id => handleDelete(id)}
                                                />
                                            </li>
                                        );
                                    })}
                                </React.Fragment>
                            )
                        })}
                        {/* Intersection observer element for pagination */}
                        {data?.hasMore && !isLoading && (
                            <li ref={ref} className="h-2 w-full pointer-events-none" />
                        )}
                        {loadingMore && (
                            <li className="p-4 px-5.5 flex gap-4 min-h-[64px] items-center justify-center">
                                <span className="text-neutral-400 text-sm">Loading more chats...</span>
                            </li>
                        )}
                    </ul>
                </div>
            </div >
        </>
    );
}

