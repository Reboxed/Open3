"use client";

import { useEffect, useState, useCallback } from "react";
import Tabs, { Tab } from "./Tabs";
import { setTabs as setTabsS, getTabs } from "../lib/utils/loadTabs"
import { ClerkLoading, SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { usePathname, useRouter } from "next/navigation";
import ChatPalette from "./ChatPalette";

export function Navbar() {
    const pathname = usePathname();
    const router = useRouter();

    const [showPalette, setShowPalette] = useState(false);
    const [tabs, setTabs] = useState<Tab[]>([]);

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
            // Map back to original tabs: permanent tabs always true, others from result
            let idx = 0;
            return tabsToCheck.map(tab => tab.permanent ? true : !!data.exists[idx++]);
        } catch {
            return tabsToCheck.map(() => true);
        }
    }, []);

    // Clean up tabs whose chats are deleted
    const cleanTabs = useCallback(async (tabsToCheck: Tab[]) => {
        const results = await checkTabsExist(tabsToCheck);
        const filteredTabs = tabsToCheck.filter((tab, i) => results[i]);
        if (filteredTabs.length !== tabsToCheck.length) {
            setTabsS(localStorage, filteredTabs);
            setTabs(filteredTabs);
            // Redirect if current path is not in filteredTabs
            const currentTab = filteredTabs.find(tab => tab.link === pathname);
            if (!currentTab) {
                if (filteredTabs.length > 0) {
                    router.replace(filteredTabs[0].link ?? "/");
                } else {
                    router.replace("/");
                }
            }
        } else {
            setTabs(tabsToCheck);
        }
    }, [checkTabsExist, pathname, router]);

    useEffect(() => {
        const lsTabs = getTabs(localStorage);
        for (let i = 0; i < lsTabs.length; i++) {
            lsTabs[i].active = lsTabs[i].link == pathname;
            if (lsTabs[i].active) break;
        }
        // Clean up deleted tabs on mount
        cleanTabs(lsTabs);
    }, [cleanTabs, pathname]);

    // Update active tab and clean up deleted tabs on path or palette change
    useEffect(() => {
        const lsTabs = getTabs(localStorage);
        let activeFound = false;
        for (let i = 0; i < lsTabs.length; i++) {
            lsTabs[i].active = lsTabs[i].link == pathname;
            if (lsTabs[i].active) {
                activeFound = true;
                break;
            }
        }
        if (!activeFound) router.replace("/");
        // Clean up deleted tabs on tab change
        cleanTabs(lsTabs);
    }, [pathname, showPalette, cleanTabs, router]);

    useEffect(() => {
        try {
            setTabsS(localStorage, tabs);
        } catch { }
    }, [tabs])

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const isMac = navigator.platform.toLowerCase().includes('mac');
            // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
            if ((isMac && e.metaKey && e.key.toLowerCase() === 'k') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 'k')) {
                e.preventDefault();
                setShowPalette(true);
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    return (
        <>
            <nav className="h-fit flex gap-2 pt-3 px-2 justify-center sticky bg-[#212121]/75 backdrop-blur-lg top-0 z-20 w-full">
                <div className="relative shrink-0 flex gap-2 w-full justify-center">
                    <Tabs
                        tabs={[
                            { id: "home", label: "Open3", link: "/", permanent: true, active: pathname.trim() == "/" },
                            ...tabs
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

