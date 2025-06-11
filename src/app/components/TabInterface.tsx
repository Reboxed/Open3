"use client";

import { useEffect, useState } from 'react';

//const DEBUG_TABS = true; // Set to true to enable debug tabs for development purposes

export type Tab = {
    id: string;
    label: string;
    permanent?: boolean;
}

export default function TabInterface({ onTabChange, onNewTab, tabs }: { onTabChange?: (tabId: string) => void, onNewTab?: () => void, tabs?: Tab[] }) {
    const [initialTabs, setInitialTabs] = useState<Tab[]>(tabs ?? []);
    const [activeTab, setActiveTab] = useState(tabs?.[0].id ?? "");

    useEffect(() => {
        if (tabs && tabs.length > 0) {
            setInitialTabs(tabs);
        } else {
            setInitialTabs([]);
            setActiveTab("");
        }
    }, [tabs]);

    const closeTab = (tabId: string) => {
        const tabIndex = (tabs ?? []).findIndex((tab) => tab.id === tabId);
        const newTabs = (tabs ?? []).filter(tab => tab.id !== tabId);
        setInitialTabs(newTabs);
        if (activeTab === tabId && newTabs.length > 0) {
            if (tabIndex > newTabs.length - 1) {
                setActiveTab(newTabs[newTabs.length - 1].id);
            } else {
                setActiveTab(newTabs[tabIndex].id);
            }
        }
    };

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
                
                .tab-inactive:not(:first-of-type):not(:hover)::after {
                    content: '';
                    position: absolute;
                    bottom: 50%;
                    transform: translateY(50%);
                    right: 2px;
                    width: 2px;
                    height: 50%;
                    background: rgba(255,255,255,0.1);
                    border-radius: 999px;
                    transition: colors 200ms;
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
                    box-shadow: 4px 4px 0 rgba(25, 25, 25, 0.65);
                }
                
                .tab-inactive:hover::after {
                    right: -16px;
                    border-bottom-left-radius: 16px;
                    box-shadow: -4px 4px 0 rgba(25, 25, 25, 0.65);
                }
            `}</style>

            <div className="flex flex-1 items-center gap-2 h-full">
                {initialTabs.map((tab) => (
                    <div
                        key={tab.id}
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
                ))}

                <button onClick={onNewTab} className="flex items-center justify-center w-8 h-8 mt-1 ml-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors duration-200">
                    <span className="text-lg leading-none">+</span>
                </button>
            </div>
        </>
    )
}
