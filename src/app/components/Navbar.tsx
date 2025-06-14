"use client";

import { Suspense, useEffect, useState } from "react";
import Tabs, { Tab } from "./Tabs";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { usePathname } from "next/navigation";
import { ApiTab, ApiError } from "../api/tabs/route";
//import useSWR from "swr";

interface NavbarProps {
    tabs: ApiTab[];
}

export function Navbar({ tabs: apiTabs }: NavbarProps) {
    const pathname = usePathname();
    const [tabs, setTabs] = useState([
        { id: "home", label: "Open3", link: "/", permanent: true },
        ...apiTabs.map(apiTab => ({
            id: apiTab.id,
            label: apiTab.label,
            link: apiTab.link,
            active: apiTab.link == pathname
        } as Tab))
    ] as Tab[]);

    // Update active tab
    useEffect(() => {
        const tabsTmp = Array.from(tabs)
        for (let i = 0; i < tabsTmp.length; i++) {
            tabsTmp[i].active = tabsTmp[i].link == pathname;
        }
        setTabs(tabsTmp);
        const activeTab = tabs.find(tab => tab.link == pathname);

        async function loadMissingTab() {
            const tabs = await fetch("/api/tabs")
                .then(res => res.json() as Promise<ApiTab[] | ApiError>)
                .catch(() => [] as ApiTab[]);
            if ("error" in tabs) return;
            setTabs([
                { id: "home", label: "Open3", link: "/", permanent: true },
                ...tabs.map(apiTab => ({
                    id: apiTab.id,
                    label: apiTab.label,
                    link: apiTab.link,
                    active: apiTab.link == pathname
                } as Tab))
            ])
        }
        if (!activeTab) {
            loadMissingTab();
            console.log("TEST");
        }
    }, [pathname]);

    return (
        <nav className="h-fit flex gap-2 pt-3 px-2 justify-center sticky bg-[#212121]/75 backdrop-blur-lg top-0 z-20 w-full">
            <div className="relative shrink-0 flex gap-2 w-full max-w-full justify-center">
                <Tabs
                    tabs={tabs || []}
                    onTabClose={tab => {
                        fetch("/api/tabs", {
                            method: "DELETE",
                            body: JSON.stringify({ id: tab.id })
                        }).then(res => res.json() as Promise<{ success?: boolean }>)
                            .catch(() => undefined);
                        const tabsTmp = Array.from(tabs)
                        tabsTmp.splice(tabsTmp.findIndex(t => t.id == tab.id), 1);
                        setTabs(tabsTmp);
                    }}
                />
                <div className="pl-4 pr-6 h-full w-fit ml-auto">
                    <Suspense fallback={<LoadingUserComponent />}>
                        <UserComponent />
                    </Suspense>
                </div>
            </div>
        </nav>
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
                <div className="pt-0.5">
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
        </>
    )
}

function LoadingUserComponent() {
    return (
        <div className="flex gap-4 items-center">
            <span className="text-transparent w-[28px] h-[28px] rounded-full bg-white/15">.</span>
        </div>
    )
}

