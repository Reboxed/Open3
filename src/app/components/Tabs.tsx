"use client";

import Link from "next/link";
import { useEffect, useState, use, MouseEvent } from "react";
import "./tabs.css"
import { redirect, usePathname, useRouter } from "next/navigation";
import next from "next";

export type Tab = {
    id: string;
    label: string;
    active?: boolean;
    permanent?: boolean;
    link?: string;
}

export interface TabCloseEvent {
    preventDefault(): void;
}

export interface TabChangeEvent {
    preventDefault(): void;
}

interface TabsProps {
    onTabChange?: (e: TabChangeEvent, tab: Tab) => void;
    onTabCreate?: () => void;
    onTabClose?: (tab: Tab, nextTab: Tab) => void;
    tabs: Tab[] | Promise<Tab[]>;
}

export default function Tabs({ onTabChange, onTabCreate, onTabClose, tabs: rawTabs }: TabsProps) {
    const initialTabs = rawTabs instanceof Promise ? use(rawTabs) : rawTabs;
    const [tabs, setTabs] = useState<Tab[]>(initialTabs ?? []);
    const [activeTab, setActiveTab] = useState<number>(tabs.findIndex(tab => tab.active));

    // Syncing the tabs with the parent --> parent can also change active tab.
    // It's the parent's responsibility to keep 1 tab active at a time.
    useEffect(() => {
        const updateTabs = async () => {
            const resolvedTabs = rawTabs instanceof Promise ? await rawTabs : rawTabs;
            setTabs(resolvedTabs ?? []);
            setActiveTab(resolvedTabs?.findIndex(tab => tab.active));
        };

        updateTabs();
    }, [rawTabs]);

    const router = useRouter();
    async function onTabChangeClick(e: MouseEvent<HTMLDivElement, globalThis.MouseEvent>, idx: number) {
        const tab = tabs[idx];
        let eventCanceled = false;
        const event = {
            preventDefault() {
                eventCanceled = true;
            },
        } as TabChangeEvent;
        onTabChange?.(event, tab);
        if (eventCanceled) {
            return;
        }

        if (tab?.link) router.replace(tab.link);
        setActiveTab(idx);
    }

    async function onCloseTabClick(idx: number) {
        const tab = tabs[idx];
        const tabsCopy = Array.from(tabs);
        tabsCopy.splice(idx, 1);
        setTabs(tabsCopy);
        let nextTab: number;
        if (activeTab >= tabsCopy.length) {
            nextTab = tabsCopy.length - 1;
        } else nextTab = activeTab;
        onTabClose?.(tab, tabsCopy[nextTab]);
        setActiveTab(nextTab);
        if (tabsCopy[nextTab]?.link) router.replace(tabsCopy[nextTab].link!);
    };

    return (
        <ul className="flex flex-1 items-stretch gap-2 h-full">
            {tabs.map((tab, idx) => (
                <li key={idx}>
                    {/*<Link
                        href={tab.link ?? ""}
                        className="!no-underline flex h-full"
                        onClick={(e) => onTabChangeClick(e, idx)}
                    >*/}
                        <div
                            onPointerOver={() => tab.link ? router.prefetch(tab.link) : null}
                            onClick={(e) => onTabChangeClick(e, idx)}
                            className={`
                                relative flex h-full items-center
                                gap-12 px-4 pl-5 py-3 
                                ${tab.permanent && "!px-[calc((48px+16px)/2)]"} cursor-pointer rounded-t-2xl font-medium
                                transition-all duration-200
                                ${activeTab == idx ?
                                    `tab-active z-10 ${!tab.permanent ? "text-neutral-200" : "text-primary-light"} !font-bold` :
                                    `tab-inactive hover:bg-[#191919]/60 ${!tab.permanent ? "text-neutral-200/65" : "text-primary-light/65 !font-bold"}`
                                }
                        `}
                        >
                            <span className="text-sm select-none whitespace-nowrap">
                                {tab.label}
                            </span>

                            {!tab.permanent && (
                                <button
                                    className="p-1 rounded cursor-pointer hover:bg-white/10 transition-opacity duration-200"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCloseTabClick(idx);
                                    }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path opacity="0.35" d="M1.38281 1.18701L9.80078 9.6052M1.38281 9.6052L9.80078 1.18723" stroke="white" strokeOpacity="0.64" strokeWidth="1.75" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    {/*</Link>*/}
                </li>
            ))}

            <button onClick={onTabCreate} className="flex items-center justify-center w-8 h-8 mt-1 ml-2 cursor-pointer hover:bg-white/5 rounded-md transition-colors duration-200">
                <span className="text-3xl font-light hover:text-white !text-neutral-200/50 leading-none">+</span>
            </button>
        </ul>
    )
}
