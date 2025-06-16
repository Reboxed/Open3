"use client";

import { useEffect, useState, useCallback } from "react";
import Tabs, { Tab } from "./Tabs";
import { setTabs as setTabsS, getTabs } from "../lib/utils/loadTabs";
import { ClerkLoading, SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { usePathname, useRouter } from "next/navigation";
import ChatPalette from "./ChatPalette";
import useTitleStream from "../hooks/useTitleStream";

export function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const [showPalette, setShowPalette] = useState(false);
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [apiTitles, setApiTitles] = useState<Map<string, string>>(new Map());
    const { titles: streamingTitles } = useTitleStream();

    // Fetch titles from API for existing chats
    const fetchTitles = useCallback(async (chatIds: string[]) => {
        const promises = chatIds.map(async (id) => {
            try {
                const res = await fetch(`/api/chat/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    return { id, title: data.label };
                }
            } catch (error) {
                console.warn(`Failed to fetch title for chat ${id}:`, error);
            }
            return null;
        });

        const results = await Promise.all(promises);
        const newApiTitles = new Map(apiTitles);
        
        results.forEach(result => {
            if (result) {
                newApiTitles.set(result.id, result.title);
            }
        });
        
        setApiTitles(newApiTitles);
    }, [apiTitles]);

    // Get the appropriate title for a tab
    const getTabTitle = useCallback((tab: Tab): string => {
        if (tab.permanent) return tab.label ?? "Open3";
        if (!tab.id) return tab.label ?? "New Chat";
        
        // Streaming title takes precedence over API title
        const streamingTitle = streamingTitles.get(tab.id);
        if (streamingTitle !== undefined) {
            return streamingTitle || "Generating title...";
        }
        
        const apiTitle = apiTitles.get(tab.id);
        return apiTitle || tab.label || "New Chat";
    }, [streamingTitles, apiTitles]);

    // Helper to check all tab IDs at once
    const checkTabsExist = useCallback(async (tabsToCheck: Tab[]): Promise<boolean[]> => {
        const ids = tabsToCheck.filter(tab => !tab.permanent && tab.id).map(tab => tab.id);
        if (ids.length === 0) return tabsToCheck.map(() => true);
        try {
            const res = await fetch("/api/chat/exists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });
            if (!res.ok) return tabsToCheck.map(() => true);
            const data = await res.json();
            let idx = 0;
            return tabsToCheck.map(tab => tab.permanent ? true : !!data.exists[idx++]);
        } catch {
            return tabsToCheck.map(() => true);
        }
    }, []);

    // Clean up tabs whose chats are deleted
    const cleanTabs = useCallback(async (tabsToCheck: Tab[]) => {
        const results = await checkTabsExist(tabsToCheck);
        const filteredTabs = tabsToCheck.filter((_, i) => results[i]);
        if (filteredTabs.length !== tabsToCheck.length) {
            setTabsS(localStorage, filteredTabs);
            setTabs(filteredTabs);
            const currentTab = filteredTabs.find(tab => tab.link === pathname);
            if (!currentTab) {
                if (filteredTabs.length > 0) {
                    router.replace(filteredTabs[0].link ?? "/");
                } else router.replace("/");
            }
        } else {
            setTabs(tabsToCheck);
            // Fetch titles for non-permanent tabs that don't have streaming titles
            const chatIds = tabsToCheck
                .filter(tab => !tab.permanent && tab.id && !streamingTitles.has(tab.id))
                .map(tab => tab.id!)
                .filter(id => !apiTitles.has(id));
            
            if (chatIds.length > 0) {
                fetchTitles(chatIds);
            }
        }
    }, [checkTabsExist, pathname, router, streamingTitles, apiTitles, fetchTitles]);

    // Single effect to sync tabs and clean up deleted ones
    useEffect(() => {
        const lsTabs = getTabs(localStorage);
        let activeFound = false;
        for (let i = 0; i < lsTabs.length; i++) {
            lsTabs[i].active = lsTabs[i].link == pathname;
            if (lsTabs[i].active) activeFound = true;
        }
        if (!activeFound && lsTabs.length > 0) router.replace("/");
        cleanTabs(lsTabs);
        // Only update localStorage if tabs changed
        setTabsS(localStorage, lsTabs);
    }, [pathname, showPalette, cleanTabs, router]);

    // Keyboard shortcut for palette
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const isMac = navigator.userAgent.toLowerCase().includes('mac');
            if ((isMac && e.metaKey && e.key.toLowerCase() === 'k') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 'k')) {
                e.preventDefault();
                setShowPalette(true);
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // Listen for chat title updates from fallback title generation
    useEffect(() => {
        function handleTitleUpdate(event: CustomEvent) {
            const { chatId, title } = event.detail;
            if (chatId && title) {
                setApiTitles(prev => new Map(prev.set(chatId, title)));
            }
        }

        window.addEventListener('chatTitleUpdate', handleTitleUpdate as EventListener);
        return () => window.removeEventListener('chatTitleUpdate', handleTitleUpdate as EventListener);
    }, []);

    return (
        <>
            <nav className="h-fit flex gap-2 pt-3 px-2 justify-center sticky bg-[#212121]/75 backdrop-blur-lg top-0 z-20 w-full">
                <div className="relative shrink-0 flex gap-2 w-full justify-center">
                    <Tabs
                        tabs={[
                            { id: "home", label: "Open3", link: "/", permanent: true, active: pathname.trim() == "/" },
                            ...tabs.map(t => ({
                                ...t,
                                label: getTabTitle(t),
                            }))
                        ]}
                        onTabChange={() => {
                            const lsTabs = getTabs(localStorage);
                            for (let i = 0; i < lsTabs.length; i++) {
                                lsTabs[i].active = lsTabs[i].link == pathname;
                                if (lsTabs[i].active) break;
                            }
                            setTabs(lsTabs);
                        }}
                        onTabCreate={() => setShowPalette(true)}
                        onTabClose={tab => {
                            let lsTabs = getTabs(localStorage);
                            const idx = lsTabs.findIndex(t => t.id == tab.id);
                            if (idx === -1 && lsTabs.length) {
                                let tabIdx: number;
                                if (idx >= lsTabs.length) tabIdx = lsTabs.length - 1;
                                else tabIdx = idx;
                                router.replace(lsTabs[tabIdx].link ?? "/");
                            } else if (lsTabs.length) {
                                lsTabs.splice(idx, 1);
                            }
                            lsTabs = lsTabs.map(t => {
                                t.active = t.link === pathname;
                                return t;
                            });
                            setTabs(lsTabs);
                            setTabsS(localStorage, lsTabs);
                        }}
                    />
                    <div className="h-full w-fit ml-auto">
                        <UserComponent />
                    </div>
                </div>
            </nav>
            <ChatPalette onDismiss={() => setShowPalette(false)} hidden={!showPalette} className="" />
        </>
    )
}

function UserComponent() {
    return (
        <>
            <SignedOut>
                <SignInButton />
                <SignUpButton />
            </SignedOut>
            <SignedIn>
                <div className="pt-1 min-w-[68px]">
                    <UserButton appearance={{
                        baseTheme: dark,
                        elements: {
                            logoImage: {
                                width: "36px",
                                height: "36px"
                            }
                        }
                    }} />
                </div>
            </SignedIn>
            <ClerkLoading>
                <LoadingUserComponent />
            </ClerkLoading>
        </>
    )
}

function LoadingUserComponent() {
    return (
        <div className="flex gap-4 items-center min-w-[68px] pt-1">
            <span className="text-transparent w-[28px] h-[28px] rounded-full bg-white/15">.</span>
        </div>
    )
}

