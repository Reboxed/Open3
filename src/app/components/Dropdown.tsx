"use client";

import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";
import React from "react";

// import Card from "./Card"; // You may need to implement or import Card if used
// import { Icon, IconTheming } from "@/types/iconType"; // You may need to define these types if used

// Minimal Card implementation for dropdown (replace with your own if needed)
function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
    return <div className={className}>{children}</div>;
}

// Minimal Icon and IconTheming types for compatibility (replace with your own if needed)
export enum IconTheming {
    LightInvert,
    DarkInvert,
    None,
}

type DropdownOption = {
    icon?: string;
    featureIcons?: string[];
    name: string;
    activeName?: string;
    value: string;
    disabled?: boolean;
    hideLabel?: boolean;
    default?: boolean;
    developer?: string; // Added for grouping by provider
    provider?: string; // Added for grouping by provider
};

export default function Dropdown({ className, label, items: options, name, options: settings, onChange }: {
    label?: string;
    name?: string;
    items: DropdownOption[];
    options?: {
        popupHorizontalAlignment?: "left" | "right" | "center";
        popupVerticalAlignment?: "top" | "bottom";
        autoCapitilisation?: boolean;
        hideSelectedElement?: boolean;
        disableLabelsOnElements?: boolean;
    }
    className?: string;
    onChange?: (selected: DropdownOption) => void;
}) {
    if (!options?.length) throw new Error("You can't make a dropdown with no options.");
    let defaultOption: DropdownOption | null = null;
    let foundSelectionIndex = 0;
    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (!defaultOption && option.default === true) {
            foundSelectionIndex = i;
            defaultOption = option;
        } else if (!option.default) continue;
        else throw new Error("Can't have more than one default.");
    }

    const [currentSelectionIndex, setCurrentSelectionIndex] = useState<number>(foundSelectionIndex);
    if (!defaultOption) defaultOption = options[0];

    const [shown, setShown] = useState(false);
    const dropdownButtonRef = useRef<HTMLButtonElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
    const [isClosing, setIsClosing] = useState(false);
    const fadeDuration = 180; // ms, must match CSS

    // Group options by provider (developer)
    const groupedByProvider = React.useMemo(() => {
        const groups: Record<string, DropdownOption[]> = {};
        options.forEach(opt => {
            // Use opt.provider or opt.developer if available, fallback to 'Other'
            const provider = opt.developer || opt.provider || 'Other';
            if (!groups[provider]) groups[provider] = [];
            groups[provider].push(opt);
        });
        return groups;
    }, [options]);

    // Modified toggleDropdown to handle fade-out
    const closeDropdown = () => {
        setIsClosing(true);
        setTimeout(() => {
            setShown(false);
            setIsClosing(false);
        }, fadeDuration);
    };

    const toggleDropdown = () => {
        if (!shown) {
            setShown(true);
            setIsClosing(false);
            if (dropdownButtonRef.current) {
                const rect = dropdownButtonRef.current.getBoundingClientRect();
                setDropdownPosition({
                    top: rect.top + window.scrollY - 12,
                    left: rect.left + window.scrollX,
                    width: rect.width,
                });
            }
        } else {
            closeDropdown();
        }
    };

    useEffect(() => {
        if (!shown) return;
        const handleClick = (e: MouseEvent) => {
            if (
                (e.target as any)?.parentElement?.parentElement?.id != "dropdown" &&
                (e.target as any)?.parentElement?.id != "dropdown" &&
                (e.target as any)?.id != "dropdown"
            ) closeDropdown();
        };
        window.addEventListener("click", handleClick);

        // Add resize handler to reposition dropdown
        const handleResize = () => {
            if (dropdownButtonRef.current) {
                const rect = dropdownButtonRef.current.getBoundingClientRect();
                setDropdownPosition({
                    top: rect.top + window.scrollY - 12,
                    left: rect.left + window.scrollX,
                    width: rect.width,
                });
            }
        };
        window.addEventListener("resize", handleResize);
        // Also reposition immediately in case of any layout shift
        handleResize();

        return () => {
            window.removeEventListener("click", handleClick);
            window.removeEventListener("resize", handleResize);
        };
    }, [shown]);

    // Ensure currentSelectionIndex updates if options or their default changes
    useEffect(() => {
        let foundSelectionIndex = 0;
        let defaultOption: DropdownOption | null = null;
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            if (!defaultOption && option.default === true) {
                foundSelectionIndex = i;
                defaultOption = option;
            } else if (!option.default) continue;
            else throw new Error("Can't have more than one default.");
        }
        if (!defaultOption) defaultOption = options[0];
        setCurrentSelectionIndex(foundSelectionIndex);
    }, [options]);

    const selectedOption = options[currentSelectionIndex];
    return (
        <div className={`relative w-max ${className}`}>
            <button
                id="dropdown"
                ref={dropdownButtonRef}
                onClick={toggleDropdown}
                className={`h-full !cursor-pointer font-semibold flex items-center gap-1 overflow-visible w-full focus:[&>#dropdown]:invert-0 focus:[&>#dropdown]:opacity-80`}
                style={{ textAlign: "left", width: "auto", minWidth: 0 }}
            >
                <span id="dropdown" className="font-normal whitespace-nowrap overflow-visible text-ellipsis" style={{ maxWidth: '100%' }}>{label}</span>
                {
                    !settings?.hideSelectedElement ? (
                        <>
                            <input name={name} type="hidden" onChange={() => { }} className="opacity-0 w-0 h-0 -z-10" value={selectedOption.value} />
                            {selectedOption.icon ?
                                <Image id="selectedIcon" src={selectedOption.icon} className={`mr-2`} width={18} height={18} alt={`${selectedOption.name} icon`} title={`${selectedOption.name} icon`} />
                                : null}
                            <span className="mr-auto text-left whitespace-nowrap overflow-visible text-ellipsis font-medium" style={{ maxWidth: '100%' }}>
                                {
                                    selectedOption.activeName ? selectedOption.activeName :
                                        settings?.autoCapitilisation ? selectedOption.name[0].toUpperCase() + selectedOption.name.slice(1) :
                                            selectedOption.name
                                }
                            </span>
                        </>
                    ) : null
                }
                <Image
                    id="dropdown"
                    src="/dropdown.svg"
                    alt="dropdown icon"
                    width={12}
                    height={12}
                    className={`opacity-40 ml-1.5 ${!shown ? "scale-100" : "-scale-100"} transition-all`}
                />
            </button>
            <div className={`z-20 fixed top-0 left-0 w-full h-full cursor-default ${!shown ? "hidden" : ""}`}/>
            {(shown || isClosing) && dropdownPosition && typeof window !== "undefined" && document.body && ReactDOM.createPortal(
                <>
                    <style>{`
                        .dropdown-fadein {
                            animation: dropdown-fadein ${fadeDuration}ms cubic-bezier(0.4,0,0.2,1);
                        }
                        .dropdown-fadeout {
                            animation: dropdown-fadeout ${fadeDuration}ms cubic-bezier(0.4,0,0.2,1);
                        }
                        @keyframes dropdown-fadein {
                            from { opacity: 0; transform: translateY(-24px) scale(0.98); }
                            to { opacity: 1; transform: translateY(0) scale(1); }
                        }
                        @keyframes dropdown-fadeout {
                            from { opacity: 1; transform: translateY(0) scale(1); }
                            to { opacity: 0; transform: translateY(-24px) scale(0.98); }
                        }
                    `}</style>
                    <div
                        id="dropdown"
                        className={`absolute w-max mx-auto dropdown transition-all z-50 shadow-highlight rounded-3xl ${isClosing ? 'dropdown-fadeout' : 'dropdown-fadein'}`}
                        style={{
                            position: "absolute",
                            left: dropdownPosition.left - 24,
                            top: dropdownPosition.top + 60,
                            minWidth: dropdownPosition.width,
                            maxWidth: '90vw',
                            maxHeight: '60vh',
                            overflowY: 'auto',
                            boxSizing: 'border-box',
                            ...(dropdownPosition.left + dropdownPosition.width > window.innerWidth ? {
                                left: Math.max(window.innerWidth - dropdownPosition.width - 16, 8),
                            } : {})
                        }}
                    >
                        <Card
                            className="w-full text-sm border-foreground/10 appearance-none outline-none bg-[hsl(0,0%,16%)] rounded-3xl items-left *:text-start !gap-1 !px-2 !py-2"
                        >
                            <div className="flex flex-col gap-4 p-2">
                                {Object.entries(groupedByProvider).map(([provider, models]) => {
                                    const typedModels = models as DropdownOption[];
                                    return (
                                        <div key={provider} className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h6 className="!font-semibold text-xs text-neutral-400 tracking-wide">{provider}</h6>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {typedModels.map((option, i) => (
                                                    <button key={option.value} disabled={option.disabled} onClick={() => {
                                                        setCurrentSelectionIndex(options.findIndex(o => o.value === option.value));
                                                        closeDropdown();
                                                        if (onChange) onChange(option);
                                                    }} data-value={option.value} className={`
                                                        not-disabled:cursor-pointer
                                                        flex items-center gap-4 w-full
                                                        disabled:opacity-50
                                                        ${options[currentSelectionIndex]?.value === option.value ?
                                                            "bg-primary shadow-active-button" :
                                                            "not-disabled:hover:bg-white/5 border border-transparent"}
                                                        px-3 py-2 rounded-lg transition-all
                                                    `}>
                                                        {typedModels[0].icon ? (
                                                            <Image src={typedModels[0].icon} width={18} height={18} alt={provider + ' logo'} className="rounded" />
                                                        ) : null}
                                                        <span className="flex items-center gap-5 font-medium text-sm text-left w-full truncate">
                                                            {settings?.autoCapitilisation ? option.name[0].toUpperCase() + option.name.slice(1) : option.name}
                                                            {option.featureIcons && option.featureIcons.length > 0 ? (
                                                                <div className="flex items-center gap-1 ml-auto text-neutral-500">
                                                                    {option.featureIcons.map((icon, index) => (
                                                                        <div key={index} className="">
                                                                            <Image src={icon} width={18} height={18} alt={`${option.name} feature icon`} />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : null}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}
