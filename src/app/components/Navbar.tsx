"use client";

import { Suspense, useEffect, useState } from "react";
import Tabs, { Tab } from "./Tabs";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, ApiTab } from "../api/tabs/route";
import useSSE from "../hooks/useSSE";

interface NavbarProps {
    tabs: ApiTab[];
}

export function Navbar({ tabs: apiTabs }: NavbarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [tabs, setTabs] = useState([
        { id: "home", label: "Open3", link: "/", permanent: true },
        ...apiTabs.map(apiTab => ({
            id: apiTab.id,
            label: apiTab.label,
            link: apiTab.link,
            active: apiTab.link == pathname
        } as Tab))
    ] as Tab[]);

    const sse = useSSE("/api/events/tabs");
    useEffect(() => {
        const message = sse.messages[sse.messages.length - 1] as {
            event: `tab-${string}-${string}`;
            data: ApiTab;
        };
        if (!message || !message.event || !message.data) return;
        const type = message.event.split("-")[1];
        const tab: Tab = {
            id: message.data.id,
            label: message.data.label,
            link: message.data.link,
            active: message.data.link == pathname,
        };
        const idx = tabs.findIndex(t => t.id == tab.id);
        switch (type) {
            case "created":
                if (idx == -1) {
                    const tabsTmp = Array.from(tabs);
                    tabsTmp.push(tab);
                    setTabs(tabsTmp);
                }
                break;
            case "deleted":
                if (idx >= 0) {
                    const tabsTmp = Array.from(tabs);
                    tabsTmp.splice(idx, 1);
                    setTabs(tabsTmp);
                    if (tab.active && tabs.length) {
                        if (idx >= tabsTmp.length) {
                            router.replace(tabs[tabsTmp.length - 1].link!);
                        } else {
                            router.replace(tabsTmp[idx].link!);
                        }
                    }
                }
                break;
            default:
                console.log("dunno wtf this is");
        }
        console.log(type, message.data.id);
    }, [sse.messages]);

    // Update active tab
    useEffect(() => {
        async function update() {
            const tabsTmp = Array.from(tabs);
            const unknownTabId = pathname.split("/")[1];
            if (unknownTabId.trim().length) {
                const tab = await fetch("/api/tabs?" + new URLSearchParams({ id: unknownTabId }).toString()).then(res => res.json() as Promise<ApiTab>).catch(() => null);
                if (!tab || tab instanceof Array || "error" in tab) {
                    const idx = tabs.findIndex(t => t.id == unknownTabId);
                    if (idx >= tabs.length) {
                        router.replace(tabs[tabs.length - 1].link!);
                    } else {
                        router.replace(tabs[idx].link!);
                    }
                    //router.replace("/");
                    return;
                }

                if (!tabsTmp.find(t => t.id == tab.id)) {
                    tabsTmp.push({
                        id: tab.id,
                        label: tab.label,
                        link: tab.link,
                        active: tab.link == pathname,
                    });
                }
            }

            let activeFound = false;
            for (let i = 0; i < tabsTmp.length; i++) {
                tabsTmp[i].active = tabsTmp[i].link == pathname;
                if (tabsTmp[i].active) {
                    activeFound = true;
                    break;
                }
            }
            setTabs(tabsTmp);
        }
        update();
    }, [pathname]);

    return (
        <nav className="h-fit flex gap-2 pt-3 px-2 justify-center sticky bg-[#212121]/75 backdrop-blur-lg top-0 z-20 w-full">
            <div className="relative shrink-0 flex gap-2 w-full justify-center">
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

