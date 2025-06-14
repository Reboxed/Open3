"use client";

import { Suspense, useEffect, useState } from "react";
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

    useEffect(() => {
        setTabs(getTabs(localStorage).map(t => {
            t.active = t.link === pathname;
            return t;
        }));
    }, []);

    // Update active tab
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
        setTabs(lsTabs);
    }, [pathname]);

    useEffect(() => {
        try {
            setTabsS(localStorage, tabs);
        } catch { }
    }, [tabs])

    return (
        <>
            <nav className="h-fit flex gap-2 pt-3 px-2 justify-center sticky bg-[#212121]/75 backdrop-blur-lg top-0 z-20 w-full">
                <div className="relative shrink-0 flex gap-2 w-full justify-center">
                    <Tabs
                        tabs={[
                            { id: "home", label: "Open3", link: "/", permanent: true, active: pathname.trim() == "/" },
                            ...tabs
                        ]}
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
            <ChatPalette hidden={!showPalette} className="" />
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

