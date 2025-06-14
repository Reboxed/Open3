"use client";

import "./tabs.css"
import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";

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

export interface TabsProps {
    onTabChange?: (e: TabChangeEvent, prev: Tab, tab: Tab) => void;
    onTabCreate?: () => void;
    onTabClose?: (tab: Tab, nextTab: Tab) => void | Promise<void>;
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
    async function onTabChangeClick(idx: number) {
        const tab = tabs[idx];
        let eventCanceled = false;
        const event = {
            preventDefault() {
                eventCanceled = true;
            },
        } as TabChangeEvent;
        onTabChange?.(event, tabs[activeTab], tab);
        setActiveTab(idx);
        if (eventCanceled) return;
        if (tab?.link) router.push(tab.link);
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
        setActiveTab(nextTab);

        if (tabsCopy[nextTab]?.link) router.prefetch(tabsCopy[nextTab].link!);
        const res = onTabClose?.(tab, tabsCopy[nextTab]);
        if (res instanceof Promise) await res;
        if (tabsCopy[nextTab]?.link) router.replace(tabsCopy[nextTab].link!);
    };

    const scrollRef = useRef<HTMLUListElement>(null);
    const [maskStyle, setMaskStyle] = useState<React.CSSProperties>({});

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const updateMask = () => {
            const scrollLeft = el.scrollLeft;
            const scrollWidth = el.scrollWidth;
            const clientWidth = el.clientWidth;

            const atStart = scrollLeft <= 0;
            const atEnd = Math.ceil(scrollLeft + clientWidth) >= scrollWidth - (el.children?.[1]?.clientWidth ?? 0)/2;

            let mask = "";

            if (atStart && atEnd) {
                // No overflow
                mask = "none";
            } else if (atStart) {
                // Only overflow on the right
                mask = "linear-gradient(to right, black 85%, transparent 100%)";
            } else if (atEnd) {
                // Only overflow on the left
                mask = "linear-gradient(to right, transparent 0%, black 20%)";
            } else {
                // Overflow on both sides
                mask = "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)";
            }

            setMaskStyle({
                WebkitMaskImage: mask,
                maskImage: mask,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat"
            });
        };

        updateMask();

        el.removeEventListener("scroll", updateMask);
        window.removeEventListener("resize", updateMask);
        el.addEventListener("scroll", updateMask);
        window.addEventListener("resize", updateMask);

        return () => {
            el.removeEventListener("scroll", updateMask);
            window.removeEventListener("resize", updateMask);
        };
    }, [tabs]);

    return (
        <>
            <ul
                className="flex flex-1 max-w-full gap-3 items-stretch h-full overflow-x-scroll pr-4 justify-start no-scrollbar"
                ref={scrollRef}
                style={maskStyle}
            >
                <style jsx>
                    {`
                    @keyframes growWidth {
                      from {
                        width: 0px;
                        min-width: 0px;
                        opacity: 1;
                      }
                      to {
                        width: 100%;
                        min-width: fit;
                        opacity: 1;
                      }
                    }

                    .animate-grow-width {
                      animation: growWidth 150ms ease-in-out forwards;
                    }
                `}
                </style>

                {tabs.map((tab, idx) => (
                    <li
                        key={idx}
                        onPointerOver={() => tab.link ? router.prefetch(tab.link) : null}
                        onClick={() => onTabChangeClick(idx)}
                        className={`
                            flex h-full items-center
                            gap-12 justify-between px-4 pl-5 py-3 min-w-fit
                            ${tab.permanent ? "!px-[calc((48px+16px)/2)] !max-w-fit" : "w-full"} cursor-pointer rounded-t-2xl font-medium
                            transition-all duration-250
                            ${activeTab == idx ?
                                `tab-active z-20 ${!tab.permanent ? "text-neutral-200" : "text-primary-light"} !font-bold` :
                                `tab-inactive hover:bg-[#191919]/60 ${!tab.permanent ? "text-neutral-200/65" : "text-primary-light/65 !font-bold"}`
                            }
                        `}
                    >
                        <span className="text-sm select-none whitespace-nowrap">
                            {tab.label}
                        </span>

                        {!tab.permanent && (
                            <button
                                className="rounded cursor-pointer hover:bg-white/10 transition-opacity duration-200"
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
                    </li>
                ))}

            </ul>
            <button onClick={onTabCreate} className="flex items-center justify-center w-8 h-8 mt-1 mx-4 pb-1 cursor-pointer hover:bg-white/5 rounded-md transition-colors duration-200">
                <span className="text-3xl font-light hover:text-white !text-neutral-200/50 leading-none">+</span>
            </button>
        </>
    )
}
