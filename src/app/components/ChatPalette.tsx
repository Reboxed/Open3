"use client";

import React from "react";
import useSWR from "swr";
import { GetChat, GetChatsResponse } from "../api/chat/route";
import { ApiError } from "../lib/types/api";
import { FormEventHandler, useEffect, useRef, useState, useMemo } from "react";
import { addTabs } from "../lib/utils/loadTabs";
import { useRouter } from "next/navigation";
import { format, isToday, isYesterday, isThisWeek, formatRelative } from "date-fns";

interface ChatPaletteProps {
    className?: string;
    hidden?: boolean;
    onDismiss: () => void;
}

// Animation duration in ms (should match CSS)
const DELETE_ANIMATION_DURATION = 350;

export default function ChatPalette({ className, hidden: hiddenOuter, onDismiss }: ChatPaletteProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [showLabel, setShowLabel] = useState(true);
    const [hidden, setHidden] = useState(hiddenOuter);
    const [selected, setSelected] = useState([0, 0]);
    const selectedRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [localChats, setLocalChats] = useState<GetChatsResponse>({
        chats: [],
        hasMore: false,
        limit: 0,
        page: 0,
        total: 0
    });
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const pendingDeleteTimeout = useRef<NodeJS.Timeout | null>(null);
    const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
    const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const touchStartRef = useRef<{ chatId: string; startTime: number } | null>(null);
    const [longPressActive, setLongPressActive] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const { data, isLoading, mutate } = useSWR("/api/chat", async path => {
        return fetch(path).then(res => res.json() as Promise<GetChatsResponse | ApiError>);
    });

    // Sync localChats with SWR data
    useEffect(() => {
        if (data && !("error" in data)) {
            setLocalChats(data);
        }
    }, [data]);

    // Scroll/selection effect
    useEffect(() => {
        const listElement = listRef.current;
        const chatOverflow = Math.min(5, localChats?.chats?.length);
        if (listElement) {
            if (selected[0] >= chatOverflow || listElement.scrollTop >= 60) {
                const scrollDistance = Math.max(0, selected[0] - chatOverflow + 1) * 64;
                listElement.scrollTo({
                    top: scrollDistance,
                    behavior: "smooth",
                });
                // Move the selectedRef div as well
                if (selectedRef.current) {
                    selectedRef.current.style.setProperty("--top-pos", Math.max(0, (64 * selected[0])) + "px");
                }
            } else {
                const selectedDiv = selectedRef.current;
                if (selectedDiv) {
                    selectedDiv.style.setProperty("--top-pos", Math.max(0, (64 * selected[0])) + "px");
                }
            }
        }
    }, [selected, localChats?.chats?.length]);

    useEffect(() => {
        const selectedDiv = selectedRef.current;
        if (selectedDiv) {
            selectedDiv.style.setProperty("--top-pos", "0px");
        }
    }, []);

    // Detect touch device
    useEffect(() => {
        const checkTouchDevice = () => {
            setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
        };
        checkTouchDevice();
        window.addEventListener('resize', checkTouchDevice);
        return () => window.removeEventListener('resize', checkTouchDevice);
    }, []);

    const router = useRouter();
    function createTab(chat: GetChat) {
        addTabs(localStorage, {
            id: chat.id,
            label: chat.label ?? "New Tab",
            link: `/chat/${chat.id}`
        });
        router.push(`/chat/${chat.id}`);
        setTimeout(() => {
            onDismiss();
        }, 75); // Delay to allow navigation to start
    }

    // Keyboard navigation
    useEffect(() => {
        const onKeyDown: typeof window.onkeydown = (e) => {
            if (e.key == "Escape") {
                e.preventDefault();
                e.stopPropagation();

                if (bulkDeleteMode || selectedChatIds.size > 0) {
                    setBulkDeleteMode(false);
                    setSelectedChatIds(new Set());
                    return;
                }

                const chat = localChats.chats[selected[0]];
                if (chat && pendingDeleteId === chat.id && !deletingId) {
                    setPendingDeleteId("");
                    if (pendingDeleteTimeout.current) {
                        clearTimeout(pendingDeleteTimeout.current);
                        pendingDeleteTimeout.current = null;
                    }
                } else if (!chat || pendingDeleteId !== chat.id) {
                    onDismiss();
                }
            }
            if (e.key == "ArrowDown") {
                e.preventDefault();
                e.stopPropagation();
                let i = selected[0] + 1;
                if (i >= localChats.chats.length) {
                    i = localChats.chats.length - 1 < 0 ? 0 : localChats.chats.length - 1;
                }
                setSelected([i, -1]);
            }
            if (e.key == "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                let i = selected[0] - 1;
                if (i < 0) {
                    i = 0;
                }
                setSelected([i, 1]);
            }
            if (e.key == "Enter") {
                e.preventDefault();
                e.stopPropagation();

                if (bulkDeleteMode && selectedChatIds.size > 0) {
                    handleBulkDelete();
                    return;
                }

                const chat = localChats.chats[selected[0]];
                if (!chat) return;
                if (pendingDeleteId === chat.id && !deletingId) {
                    if (pendingDeleteTimeout.current) {
                        clearTimeout(pendingDeleteTimeout.current);
                        pendingDeleteTimeout.current = null;
                    }
                    handleDelete(chat.id);
                } else if (!chat || pendingDeleteId !== chat.id) {
                    createTab(chat);
                }
            }
            if (e.key === "Delete" || (e.shiftKey && e.key === "Backspace")) {
                e.preventDefault();
                e.stopPropagation();

                if (bulkDeleteMode && selectedChatIds.size > 0) {
                    handleBulkDelete();
                    return;
                }

                const chat = localChats.chats[selected[0]];
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
            }
        };

        if (hiddenOuter !== hidden) {
            setHidden(hiddenOuter);
        }
        if (hiddenOuter) {
            window.onkeydown = null;
        } else {
            if (!isTouchDevice) inputRef.current?.focus();
            window.onkeydown = onKeyDown;
        }
        return () => {
            if (window.onkeydown === onKeyDown) window.onkeydown = null;
            // Clean up touch timeout
            if (touchTimeoutRef.current) {
                clearTimeout(touchTimeoutRef.current);
                touchTimeoutRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hiddenOuter, localChats.chats, pendingDeleteId, onDismiss, selected, hidden, isTouchDevice, bulkDeleteMode, selectedChatIds]);

    // Clean up touch timeouts when bulk mode changes
    useEffect(() => {
        if (!bulkDeleteMode) {
            if (touchTimeoutRef.current) {
                clearTimeout(touchTimeoutRef.current);
                touchTimeoutRef.current = null;
            }
            touchStartRef.current = null;
            setLongPressActive(null);
        }
    }, [bulkDeleteMode]);

    // Reset pendingDeleteId if selection changes
    useEffect(() => {
        setPendingDeleteId(null);
        if (pendingDeleteTimeout.current) {
            clearTimeout(pendingDeleteTimeout.current);
            pendingDeleteTimeout.current = null;
        }
    }, [selected]);

    // Refetch chats when unhidden
    useEffect(() => {
        if (!hidden) {
            if (isLoading) return;
            (async function () {
                const chats = await fetch("/api/chat").then(res => res.json() as Promise<GetChatsResponse | ApiError>);
                setLocalChats(chats && !("error" in chats) ? chats : {
                    chats: [],
                    hasMore: false,
                    limit: 0,
                    page: 0,
                    total: 0
                });
            })();
        }
    }, [hidden, isLoading]);

    const onInput: FormEventHandler<HTMLInputElement> = (event) => {
        const value = event.currentTarget.value;
        setShowLabel(!value.length);
        setSearchQuery(value); // update search query
    };

    // Handle bulk delete
    const handleBulkDelete = async () => {
        if (selectedChatIds.size === 0) return;

        const chatIdsToDelete = Array.from(selectedChatIds);
        setBulkDeleteMode(false);
        setSelectedChatIds(new Set());

        // Add delete animation class to all selected chats
        chatIdsToDelete.forEach(id => setDeletingId(id));

        setTimeout(async () => {
            try {
                const result = await fetch('/api/chat/bulk', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chatIds: chatIdsToDelete })
                }).then(res => res.json());

                if (!result.success) {
                    console.error('Bulk delete failed:', result.error);
                    return;
                }

                // Update local state
                setLocalChats(prev => {
                    const newChats = prev.chats.filter(c => !chatIdsToDelete.includes(c.id));

                    // Adjust selection if needed
                    if (chatIdsToDelete.includes(localChats.chats[selected[0]]?.id)) {
                        const newIdx = Math.min(selected[0], newChats.length - 1);
                        setSelected([Math.max(0, newIdx), 0]);
                    }

                    // Dismiss palette if no chats left
                    if (newChats.length === 0) {
                        setTimeout(() => onDismiss(), 0);
                    }

                    return { ...prev, chats: newChats };
                });

                mutate(); // revalidate SWR
            } catch (error) {
                console.error('Failed to delete chats:', error);
            } finally {
                setDeletingId(null);
            }
        }, DELETE_ANIMATION_DURATION);
    };

    // Handle delete with animation
    const handleDelete = async (chatId: string) => {
        setPendingDeleteId(null);
        // Find index of chat to be deleted
        const idxToDelete = localChats.chats.findIndex(c => c.id === chatId);
        setDeletingId(chatId);
        setTimeout(async () => {
            const result = await fetch(`/api/chat/${chatId}`, { method: "DELETE" }).then(res => res.json() as Promise<{ success: string } | ApiError>).catch(() => null);
            if (!result || "error" in result) {
                setDeletingId(null);
                return;
            }
            setLocalChats(prev => {
                const newChats = prev.chats.filter(c => c.id !== chatId);
                // If the deleted chat was selected and was the last, move selection to new last
                if (idxToDelete === selected[0]) {
                    let newIdx = idxToDelete;
                    if (newIdx >= newChats.length) newIdx = newChats.length - 1;
                    setSelected([Math.max(0, newIdx), 0]);
                }
                // Dismiss palette if this was the last chat
                if (prev.chats.length === 1) {
                    setTimeout(() => onDismiss(), 0); // Defer to avoid React setState in render error
                }
                return { ...prev, chats: newChats };
            });
            setDeletingId(null);
            mutate(); // revalidate SWR
        }, DELETE_ANIMATION_DURATION);
    };

    // Pagination state
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Fetch chats with pagination
    useEffect(() => {
        if (hidden) return;
        setPage(1);
        setHasMore(true);
        setLocalChats({ chats: [], hasMore: false, limit: 0, page: 0, total: 0 });
    }, [hidden]);

    useEffect(() => {
        if (hidden) return;
        setLoadingMore(true);
        fetch(`/api/chat?page=${page}&limit=25`).then(res => res.json() as Promise<GetChatsResponse | ApiError>)
            .then(chats => {
                if (!('error' in chats)) {
                    setLocalChats(prev => {
                        let mergedChats;
                        if (page === 1) {
                            mergedChats = chats.chats;
                        } else {
                            const existingIds = new Set(prev.chats.map(c => c.id));
                            mergedChats = [...prev.chats];
                            for (const chat of chats.chats) {
                                if (!existingIds.has(chat.id)) {
                                    mergedChats.push(chat);
                                }
                            }
                        }
                        return {
                            ...chats,
                            chats: mergedChats
                        };
                    });
                    setHasMore(chats.hasMore);
                }
            })
            .finally(() => setLoadingMore(false));
    }, [page, hidden]);

    // Infinite scroll: load next page when reaching bottom
    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        function onScroll() {
            if (!list || !hasMore || loadingMore) return;
            if (list.scrollTop + list.clientHeight >= list.scrollHeight - 10) {
                setPage(p => p + 1);
            }
        }
        list.addEventListener('scroll', onScroll);
        return () => list.removeEventListener('scroll', onScroll);
    }, [hasMore, loadingMore]);

    // Platform shortcut label (fix hydration)
    const [shortcutLabel, setShortcutLabel] = useState("CTRL+K");
    useEffect(() => {
        if (typeof window !== "undefined" && navigator.platform.toLowerCase().includes("mac")) {
            setShortcutLabel("CMD+K");
        } else {
            setShortcutLabel("CTRL+K");
        }
    }, []);

    // Filter chats by search query (case-insensitive, label only)
    const filteredChats = searchQuery.trim().length > 0
        ? localChats.chats.filter(chat =>
            (chat.label ?? "New Chat").toLowerCase().includes(searchQuery.trim().toLowerCase())
        )
        : localChats.chats;

    // Helper to group chats by date section
    function getSectionLabel(date: Date) {
        if (isToday(date)) return "Today";
        if (isYesterday(date)) return "Yesterday";
        if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, "EEEE"); // Weekday name
        return formatRelative(date, "MM/dd/yyyy"); // Fallback to date
    }

    // Group chats into sections (memoized)
    const chatsWithSections = useMemo(() => {
        const sections: Array<{ section: string; chats: typeof filteredChats }> = [];
        filteredChats?.forEach(chat => {
            const createdAt = chat.createdAt ? new Date(chat.createdAt) : new Date();
            const section = getSectionLabel(createdAt);
            if (!sections.length || sections[sections.length - 1].section !== section) {
                sections.push({ section, chats: [chat] });
            } else {
                sections[sections.length - 1].chats.push(chat);
            }
        });
        return sections;
    }, [filteredChats]);

    // For adaptive selected div
    const chatItemRefs = useRef<(HTMLLIElement | null)[]>([]);
    useEffect(() => {
        if (!listRef.current || !selectedRef.current) return;
        // Find the flat index of the selected chat in the rendered list
        let flatIdx = 0;
        let found = false;
        for (let i = 0; i < chatsWithSections.length; ++i) {
            for (let j = 0; j < chatsWithSections[i].chats.length; ++j) {
                if (flatIdx === selected[0]) {
                    found = true;
                    break;
                }
                flatIdx++;
            }
            if (found) break;
        }
        const el = chatItemRefs.current[selected[0]];
        if (el && selectedRef.current) {
            const rect = el.getBoundingClientRect();
            const top = el.offsetTop;
            selectedRef.current.style.setProperty("--top-pos", `${top}px`);
            selectedRef.current.style.height = `${rect.height}px`;
        }
    }, [selected, chatsWithSections, filteredChats?.length, hidden]);

    return (
        <>
            <style>{`
                .chat-delete-anim {
                    opacity: 0 !important;
                    transform: translateX(50px) scale(0.95);
                    transition: opacity ${DELETE_ANIMATION_DURATION}ms, transform ${DELETE_ANIMATION_DURATION}ms;
                }
                
                .chat-long-press {
                    animation: pulse-selection 0.5s ease-out;
                }
                
                @keyframes pulse-selection {
                    0% { 
                        transform: scale(1);
                        background-color: rgba(59, 130, 246, 0.1);
                    }
                    50% { 
                        transform: scale(1.02);
                        background-color: rgba(59, 130, 246, 0.3);
                    }
                    100% { 
                        transform: scale(1);
                        background-color: rgba(59, 130, 246, 0.2);
                    }
                }
                
                /* Custom scrollbar styles for chat list */
                ul::-webkit-scrollbar {
                    width: 8px;
                    background: transparent;
                    position: absolute;
                }
                ul::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.1);
                    border-radius: 9999px;
                }
                ul::-webkit-scrollbar-track {
                    background: transparent;
                }
                ul::-webkit-scrollbar-button {
                    background: transparent;
                    display: none;
                    height: 0;
                    width: 0;
                }
                ul {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255,255,255,0.1) transparent;
                    /* Overlay scrollbar so it doesn't move content */
                }
            `}</style>
            <div
                className={`z-20 bg-black/15 absolute top-0 left-0 right-0 bottom-0 text-transparent select-none ${hidden ? "pointer-events-none opacity-0" : "opacity-100"} backdrop-blur-xs transition-opacity duration-350`}
                onClick={() => {
                    onDismiss();
                }}
            >
                .
            </div>
            <div className={`fixed flex flex-col items-stretch gap-5 w-8/10 max-w-[1035px] left-1/2 top-1/2 -translate-1/2 z-25 ${hidden ? "pointer-events-none" : ""} transition-all duration-500 ease-in-out ${className}`}>
                <div
                    className={`
                    flex bg-[rgba(36,36,36,0.75)] gap-3 p-4 items-center justify-stretch pr-5
                    backdrop-blur-2xl shadow-highlight rounded-2xl cursor-text
                    transition-all duration-250
                    ${hidden ? "!bg-[rgba(36,36,36,0)] !backdrop-blur-none opacity-0" : ""}
                `}
                    onClick={() => inputRef.current?.focus()}
                >
                    <div className="bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl text-transparent flex justify-center items-center">
                        <svg width="13" height="17" viewBox="0 0 13 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path opacity="0.9" d="M6.37204 1.29353C6.46301 0.828376 6.50849 0.595801 6.60694 0.595843C6.70538 0.595885 6.75067 0.828499 6.84124 1.29373L7.18501 3.05959C7.49945 4.67474 7.65667 5.48232 8.07585 6.12959C8.31594 6.50033 8.61602 6.82856 8.96381 7.10084C9.571 7.57622 10.3613 7.80504 11.942 8.26268C12.3106 8.36941 12.495 8.42278 12.5315 8.51159C12.5515 8.56015 12.5515 8.61464 12.5315 8.66321C12.495 8.75202 12.3107 8.80538 11.942 8.9121C10.3618 9.3696 9.57174 9.59835 8.96466 10.0736C8.61643 10.3461 8.31601 10.6748 8.07573 11.0461C7.65686 11.6933 7.49985 12.5007 7.18582 14.1156L6.84125 15.8875C6.75069 16.3532 6.7054 16.5861 6.60694 16.5861C6.50847 16.5861 6.46299 16.3533 6.37203 15.8877L6.10216 14.5062C5.71138 12.5058 5.51599 11.5056 4.92333 10.7508C4.79982 10.5935 4.66465 10.4458 4.51896 10.3088C3.81982 9.65147 2.84091 9.36806 0.883087 8.80122C0.607498 8.72143 0.469704 8.68154 0.456627 8.60844C0.454137 8.59452 0.454137 8.58027 0.456627 8.56635C0.469704 8.49325 0.607505 8.45335 0.883108 8.37356C2.84144 7.80658 3.8206 7.52309 4.51985 6.86551C4.6651 6.72892 4.79988 6.58161 4.92308 6.42483C5.51614 5.67009 5.71178 4.66971 6.10306 2.66894L6.37204 1.29353Z" fill="white" />
                        </svg>
                    </div>
                    <div className="relative w-full">
                        <label htmlFor="search" hidden={!showLabel} className="text-neutral-300/60 left-0 absolute pointer-events-none">
                            Search your chats...
                        </label>
                        <input ref={inputRef} onInput={onInput} id="search" className="w-full outline-none text-neutral-50/80" />
                    </div>
                    <div className="bg-white/10 backdrop-blur-xl z-10 px-3 h-8 rounded-xl flex justify-center items-center text-sm font-mono text-neutral-200/65">
                        {shortcutLabel}
                    </div>
                </div>
                {bulkDeleteMode && (
                    <div className="flex bg-[rgba(36,36,36,0.75)] gap-3 p-4 items-center justify-between backdrop-blur-2xl shadow-highlight rounded-2xl">
                        <div className="text-neutral-300/80 text-sm">
                            {selectedChatIds.size} chat{selectedChatIds.size !== 1 ? 's' : ''} selected
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setBulkDeleteMode(false);
                                    setSelectedChatIds(new Set());
                                }}
                                className="bg-white/10 backdrop-blur-xl px-4 py-2 rounded-xl text-sm text-neutral-200/80 hover:bg-white/20 transition-all duration-200 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                disabled={selectedChatIds.size === 0}
                                className="bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed px-4 py-2 rounded-xl text-sm text-white transition-all duration-200 cursor-pointer"
                            >
                                Delete Selected
                            </button>
                        </div>
                    </div>
                )}
                <div
                    className={`
                    flex bg-[rgba(36,36,36,0.75)] items-center justify-stretch
                    backdrop-blur-2xl shadow-highlight rounded-2xl
                    transition-all duration-250 relative
                    ${hidden ? "!bg-[rgba(36,36,36,0)] !backdrop-blur-none opacity-0" : ""}
                `}
                >
                    <ul ref={listRef} className="flex flex-col items-stretch justify-stretch w-full max-h-[calc(5*64px)] overflow-y-auto overflow-x-clip transition-all duration-200 relative">
                        {!bulkDeleteMode && !isTouchDevice && (
                            <div
                                ref={selectedRef}
                                className="bg-white/5 w-full absolute rounded-2xl text-transparent select-none pointer-events-none shadow-highlight-sm transition-all duration-200"
                                style={{ top: `var(--top-pos, 0px)`, height: 64 }}
                            />
                        )}
                        {chatsWithSections.length === 0 && !isLoading && !loadingMore && (
                            <li className="p-4 px-5.5 flex gap-4 min-h-[64px] items-center">
                                <span>No chats found.</span>
                            </li>
                        )}
                        {isLoading && !loadingMore && (
                            <li className="p-4 px-5.5 flex gap-4 min-h-[64px] items-center">
                                <span>Loading... please wait</span>
                            </li>
                        )}
                        {chatsWithSections.map((section, sectionIdx) => (
                            <React.Fragment key={section.section}>
                                <li className="px-4 py-2 text-xs text-neutral-400 font-semibold select-none">
                                    {section.section}
                                </li>
                                {section.chats.map((chat, idxInSection) => {
                                    // Flat index in filteredChats
                                    const flatIdx = filteredChats.findIndex(c => c.id === chat.id);
                                    const isSelected = selectedChatIds.has(chat.id);
                                    const isDeleting = deletingId === chat.id;
                                    const isLongPressing = longPressActive === chat.id;
                                    const createdAt = chat.createdAt ? new Date(chat.createdAt) : new Date();
                                    const timeLabel = format(createdAt, "mm:HH");
                                    return (
                                        <li
                                            key={chat.id}
                                            ref={el => { chatItemRefs.current[flatIdx] = el; }}
                                            className={`
                                                p-4 h-[64px] flex gap-4 items-center text-neutral-50/80 w-full cursor-pointer 
                                                ${isSelected ? "bg-blue-500/20 border border-blue-500/50" : flatIdx !== selected[0] ? "hover:bg-white/[0.03]" : ""} 
                                                rounded-2xl transition-all duration-200 overflow-clip
                                                hover:[&>#delete]:!opacity-100 hover:[&>#delete]:!translate-0 
                                                ${isDeleting ? "chat-delete-anim" : ""}
                                                ${isLongPressing ? "chat-long-press" : ""}
                                            `}
                                            onTouchStart={e => {
                                                if (!isTouchDevice) return;
                                                
                                                const target = e.target as HTMLElement;
                                                if (
                                                    target.id === "delete" ||
                                                    target.parentElement?.id === "delete" ||
                                                    target.parentElement?.parentElement?.id === "delete"
                                                ) return;

                                                touchStartRef.current = {
                                                    chatId: chat.id,
                                                    startTime: Date.now()
                                                };

                                                // Start long press timer (500ms)
                                                touchTimeoutRef.current = setTimeout(() => {
                                                    if (touchStartRef.current?.chatId === chat.id) {
                                                        // Add long press animation
                                                        setLongPressActive(chat.id);
                                                        
                                                        // Trigger haptic feedback if available
                                                        if ('vibrate' in navigator) {
                                                            navigator.vibrate(50);
                                                        }
                                                        
                                                        // Enter bulk mode and select this chat
                                                        setBulkDeleteMode(true);
                                                        setSelectedChatIds(prev => {
                                                            const newSet = new Set(prev);
                                                            newSet.add(chat.id);
                                                            return newSet;
                                                        });
                                                        
                                                        // Remove animation after it completes
                                                        setTimeout(() => setLongPressActive(null), 500);
                                                        
                                                        touchStartRef.current = null;
                                                    }
                                                }, 500);
                                            }}
                                            onTouchEnd={e => {
                                                if (!isTouchDevice) return;
                                                
                                                if (touchTimeoutRef.current) {
                                                    clearTimeout(touchTimeoutRef.current);
                                                    touchTimeoutRef.current = null;
                                                }
                                                
                                                setLongPressActive(null);
                                                
                                                // If we're in bulk mode, handle tap as selection toggle
                                                if (bulkDeleteMode && touchStartRef.current) {
                                                    const touchDuration = Date.now() - touchStartRef.current.startTime;
                                                    if (touchDuration < 500) {
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
                                                // If touch was released quickly and we're not in bulk mode, it's a tap
                                                else if (touchStartRef.current && !bulkDeleteMode) {
                                                    const touchDuration = Date.now() - touchStartRef.current.startTime;
                                                    if (touchDuration < 500) {
                                                        createTab(chat);
                                                    }
                                                }
                                                
                                                touchStartRef.current = null;
                                            }}
                                            onTouchMove={e => {
                                                // Cancel long press if user moves finger
                                                if (touchTimeoutRef.current) {
                                                    clearTimeout(touchTimeoutRef.current);
                                                    touchTimeoutRef.current = null;
                                                }
                                                setLongPressActive(null);
                                                touchStartRef.current = null;
                                            }}
                                            onClick={e => {
                                                // Skip click handling on touch devices to avoid conflicts
                                                if (isTouchDevice) return;
                                                
                                                const clickTarget = e.target as HTMLElement;
                                                if (
                                                    clickTarget.id === "delete" ||
                                                    clickTarget.parentElement?.id === "delete" ||
                                                    clickTarget.parentElement?.parentElement?.id === "delete"
                                                ) return;

                                                if (e.shiftKey) {
                                                    e.preventDefault();
                                                    // Toggle bulk selection mode
                                                    setBulkDeleteMode(true);
                                                    setSelectedChatIds(prev => {
                                                        const newSet = new Set(prev);
                                                        if (newSet.has(chat.id)) {
                                                            newSet.delete(chat.id);
                                                        } else {
                                                            newSet.add(chat.id);
                                                        }
                                                        return newSet;
                                                    });
                                                } else if (bulkDeleteMode) {
                                                    // In bulk mode, regular click toggles selection
                                                    setSelectedChatIds(prev => {
                                                        const newSet = new Set(prev);
                                                        if (newSet.has(chat.id)) {
                                                            newSet.delete(chat.id);
                                                        } else {
                                                            newSet.add(chat.id);
                                                        }
                                                        return newSet;
                                                    });
                                                } else {
                                                    createTab(chat);
                                                }
                                            }}
                                        >
                                            {bulkDeleteMode && (
                                                <div className="z-10 w-8 h-8 rounded-xl flex justify-center items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => { }}
                                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                    />
                                                </div>
                                            )}
                                            <div className="bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl text-transparent flex justify-center items-center">
                                                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M4.16406 10.0234C4.16406 11.9098 5.69369 13.4394 7.58008 13.4395H11.8271L10.8408 12.2803L12.1416 11.1729L14.749 14.2383L12.1416 17.3037L10.8408 16.1973L11.7334 15.1475H7.58008C4.75049 15.1474 2.45703 12.853 2.45703 10.0234V2.75H4.16406V10.0234Z" fill="white" />
                                                    <mask id="mask0_3179_681" style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="1" y="1" width="17" height="18">
                                                        <path d="M1.13281 11.7737C1.90193 14.6132 4.49496 16.7033 7.57812 16.7034H9.0332L9.83105 17.3821L11.1318 18.4885L11.5566 18.8499H1.13281V11.7737ZM17.2637 18.8499H12.8662L13.3242 18.3118L15.9316 15.2463L16.7891 14.2385L15.9316 13.2307L13.3242 10.1653L12.3164 8.97974L11.1309 9.98853L9.83008 11.0959L8.9043 11.884H7.57812C6.55094 11.884 5.71796 11.0508 5.71777 10.0237V1.41528H17.2637V18.8499Z" fill="white" />
                                                    </mask>
                                                    <g mask="url(#mask0_3179_681)">
                                                        <path d="M11.5449 13.4551H5.96484V11.748H11.5449V13.4551Z" fill="white" />
                                                        <path d="M12.9707 10.4727H5.96484V8.76562H12.9707V10.4727Z" fill="white" />
                                                        <path d="M11.5449 7.49512H5.96484V5.78809H11.5449V7.49512Z" fill="white" />
                                                        <path d="M14.7471 4.51855H5.96484V2.81055H14.7471V4.51855Z" fill="white" />
                                                    </g>
                                                </svg>
                                            </div>
                                            <span className="flex-1 truncate">{chat.label ?? "New Chat"}</span>
                                            <span className="ml-2 text-xs text-neutral-400 font-mono">{timeLabel}</span>
                                            {/* ...existing delete button... */}
                                            {!bulkDeleteMode && (
                                                <div
                                                    id="delete"
                                                    style={{
                                                        opacity: flatIdx === selected[0] ? 1 : -1,
                                                        translate: flatIdx === selected[0] ? "0 0" : "50px 0",
                                                        background: pendingDeleteId === chat.id ? '#ef4444' : undefined,
                                                        color: pendingDeleteId === chat.id ? '#fff' : undefined,
                                                        border: pendingDeleteId === chat.id ? '1px solid #ef4444' : undefined,
                                                        width: 32, height: 32, position: 'relative',
                                                    }}
                                                    className={`
                                                        bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl text-transparent flex justify-center items-center cursor-pointer ml-auto transition-all duration-200
                                                        hover:opacity-100 hover:translate-0 hover:bg-white/20
                                                        ${pendingDeleteId === chat.id ? '!bg-red-500 !text-white' : ''}
                                                    `}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        if (deletingId) return;
                                                        if (pendingDeleteId === chat.id) {
                                                            if (pendingDeleteTimeout.current) {
                                                                clearTimeout(pendingDeleteTimeout.current);
                                                                pendingDeleteTimeout.current = null;
                                                            }
                                                            handleDelete(chat.id);
                                                        } else {
                                                            setPendingDeleteId(chat.id);
                                                            if (pendingDeleteTimeout.current) {
                                                                clearTimeout(pendingDeleteTimeout.current);
                                                            }
                                                            pendingDeleteTimeout.current = setTimeout(() => setPendingDeleteId(id => id === chat.id ? null : id), 3000);
                                                        }
                                                    }}
                                                >
                                                    <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: pendingDeleteId === chat.id ? 'scale(0)' : 'scale(1)', zIndex: pendingDeleteId === chat.id ? 0 : 1 }}>
                                                        {/* Trash SVG */}
                                                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform duration-200">
                                                            <rect x="4.01562" y="1.95166" width="9.96755" height="1.88327" rx="0.941634" fill="white" />
                                                            <path d="M12.9915 5.20386C13.5677 5.20391 14.0246 5.6903 13.9896 6.26538L13.4642 14.8933C13.4321 15.421 12.9949 15.8328 12.4662 15.8328H5.59311C5.06695 15.8326 4.63122 15.4242 4.59604 14.8992L4.01791 6.27124C3.97923 5.69402 4.4365 5.204 5.01498 5.20386H12.9915ZM11.2523 6.53979L10.888 14.7185L12.1292 14.6794L12.4945 6.50171L11.2523 6.53979ZM5.98471 14.6794H7.26693L6.90268 6.50171H5.61947L5.98471 14.6794ZM8.42025 14.6794H9.73764L9.73471 6.50171H8.41732L8.42025 14.6794Z" fill="white" />
                                                        </svg>
                                                    </span>
                                                    <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: pendingDeleteId === chat.id ? 'scale(1)' : 'scale(0)', zIndex: pendingDeleteId === chat.id ? 1 : 0 }}>
                                                        {/* Checkmark SVG */}
                                                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M3.5 9.5208L7.63598 13.1296L14.5 4.87061" stroke="white" strokeWidth="2.5" />
                                                        </svg>
                                                    </span>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                        {loadingMore && (
                            <li className="p-4 px-5.5 flex gap-4 min-h-[64px] items-center">
                                <span>Loading more...</span>
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        </>
    );
}

