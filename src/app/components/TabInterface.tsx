"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

//const DEBUG_TABS = true; // Set to true to enable debug tabs for development purposes

export type Tab = {
    id: string;
    label: string;
    link: string;
    permanent?: boolean;
}

export default function TabInterface({ onTabChange, onNewTab, tabs: initialTabs }: { onTabChange?: (tabId: string) => void, onNewTab?: () => void, tabs?: Tab[] }) {
    const params = useParams();
    const [tabs, setTabs] = useState<Tab[]>(initialTabs ?? []);
    const [activeTab, setActiveTab] = useState(initialTabs?.[0].id ?? "");

    useEffect(() => {
        if (initialTabs?.find(tab => tab.link == params.id))
            if (initialTabs && initialTabs.length > 0) {
                setTabs(initialTabs);
            } else {
                setTabs([]);
                setActiveTab("");
            }
    }, [initialTabs, params]);

    const closeTab = async (tabId: string) => {
        const tabIndex = (initialTabs ?? []).findIndex((tab) => tab.id === tabId);
        const newTabs = (initialTabs ?? []).filter(tab => tab.id !== tabId);
        setTabs(newTabs);
        if (activeTab === tabId && newTabs.length > 0) {
            if (tabIndex > newTabs.length - 1) {
                setActiveTab(newTabs[newTabs.length - 1].id);
            } else {
                setActiveTab(newTabs[tabIndex].id);
            }
        }
        await fetch(`/api/tab?user_id=test`, {
            method: "DELETE",
            body: JSON.stringify({
                chatId: tabId
            }),
        });
    };

    async function _onNewTab() {
        onNewTab?.();
    }

    return (
        // bg-[#191919]
        <>
            <style jsx>{`
                .tab-active {
                    position: relative;
                    background: #191919;
                    border-radius: 16px 16px 0 0;
                }
                
                .tab-active::before,
                .tab-active::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    width: 16px;
                    height: 16px;
                    background: #00000000;
                }
                
                .tab-active::before {
                    left: -16px;
                    border-bottom-right-radius: 16px;
                    box-shadow: 4px 4px 0 #191919;
                }
                
                .tab-active::after {
                    right: -16px;
                    border-bottom-left-radius: 16px;
                    box-shadow: -4px 4px 0 #191919;
                }
                
                .tab-inactive {
                    position: relative;
                    border-radius: 16px 16px 0 0;
                }
                
                .tab-inactive:hover::before,
                .tab-inactive:hover::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    width: 16px;
                    height: 16px;
                    background: #00000000;
                }
                
                .tab-inactive:hover::before {
                    left: -16px;
                    border-bottom-right-radius: 16px;
                    box-shadow: 4px 4px 0 rgba(25, 25, 25, 0.40);
                }
                
                .tab-inactive:hover::after {
                    right: -16px;
                    border-bottom-left-radius: 16px;
                    box-shadow: -4px 4px 0 rgba(25, 25, 25, 0.40);
                }
            `}</style>

            <div className="flex flex-1 items-stretch gap-2 h-full">
                {tabs.map((tab) => (
                    <Link className="!no-underline flex" href={tab.link} key={tab.id}>
                        <div
                            className={`
                            relative flex items-center
                            gap-12 px-4 pl-5 py-3 
                            ${tab.permanent ? "!px-[calc((48px+16px)/2)]" : ""} cursor-pointer rounded-t-2xl font-medium
                            transition-all duration-200
                            ${activeTab === tab.id ?
                                    `tab-active z-10 ${!tab.permanent ? "text-neutral-200" : "text-primary-light"} !font-bold` :
                                    `tab-inactive hover:bg-[#191919]/60 ${!tab.permanent ? "text-neutral-200/65" : "text-primary-light/65 !font-bold"}`
                                }
                        `}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className="text-sm select-none whitespace-nowrap">
                                {tab.label}
                            </span>

                            {!tab.permanent && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); onTabChange?.(tab.id) }}
                                    className="p-1 rounded cursor-pointer hover:bg-white/10 transition-opacity duration-200"
                                >
                                    <svg width="15" height="15" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path opacity="0.35" d="M1.38281 1.18701L9.80078 9.6052M1.38281 9.6052L9.80078 1.18723" stroke="white" strokeOpacity="0.64" strokeWidth="1.75" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </Link>
                ))}

                <button onClick={_onNewTab} className="flex items-center justify-center w-8 h-8 mt-1 ml-2 cursor-pointer hover:bg-white/5 rounded-md transition-colors duration-200">
                    <span className="text-3xl font-light hover:text-white !text-neutral-200/50 leading-none">+</span>
                </button>
            </div>
        </>
    )
}
