"use client";

import { Suspense, useEffect, useState } from "react";
import Tabs, { Tab } from "./Tabs";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { usePathname } from "next/navigation";

export function Navbar() {
    const pathname = usePathname();
    const [tabs, setTabs] = useState<Tab[]>([
        { id: "home", label: "Open3", link: "/", permanent: true },
        { id: "test", label: "Pygame", link: "/test" },
        { id: "test1", label: "Bana", link: "/test1" },
    ]);

    for (let i = 0; i < tabs.length; i++) {
        tabs[i].active = tabs[i].link == pathname;
    }

    // Update active tab
    useEffect(() => {
        if (!tabs) return;
        for (let i = 0; i < tabs?.length; i++) {
            tabs[i].active = tabs[i].link == pathname;
        }
        setTabs(tabs);
    }, [pathname, tabs]);

    return (
        <nav className="h-fit flex gap-2 pt-3 px-2 justify-center sticky bg-[#212121]/75 backdrop-blur-lg top-0 z-20 w-full">
            <div className="relative shrink-0 flex gap-2 w-full justify-center">
                <Tabs tabs={tabs || []} />
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

