"use client";

import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";

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
export type Icon = {
    url: string;
    invert?: IconTheming;
};

type DropdownOption = {
    icon?: Icon;
    name: string;
    activeName?: string;
    value: string;
    disabled?: boolean;
    hideLabel?: boolean;
    default?: boolean;
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

    const toggleDropdown = () => {
        setShown(!shown);
        if (!shown && dropdownButtonRef.current) {
            const rect = dropdownButtonRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + window.scrollY + 8, // 8px gap
                left: rect.left + window.scrollX,
                width: rect.width,
            });
        }
    };

    useEffect(() => {
        if (!shown) return;
        const handleClick = (e: MouseEvent) => {
            if (
                (e.target as any)?.parentElement?.parentElement?.id != "dropdown" &&
                (e.target as any)?.parentElement?.id != "dropdown" &&
                (e.target as any)?.id != "dropdown"
            ) setShown(false);
        };
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, [shown]);

    const selectedOption = options[currentSelectionIndex];
    return (
        <div className={`relative w-max ${className}`}>
            <button
                id="dropdown"
                ref={dropdownButtonRef}
                onClick={toggleDropdown}
                className={`btn h-full !cursor-pointer font-semibold flex items-center gap-1 overflow-visible w-full focus:[&>#dropdown]:invert-0 focus:[&>#dropdown]:opacity-80 ${selectedOption.icon?.invert == IconTheming.LightInvert ? "focus:[&>#selectedIcon]:invert" : ""}`}
                style={{ textAlign: "left", width: "auto", minWidth: 0 }}
            >
                <span id="dropdown" className="font-normal whitespace-nowrap overflow-visible text-ellipsis" style={{maxWidth: '100%'}}>{label}</span>
                {
                    !settings?.hideSelectedElement ? (
                        <>
                            <input name={name} type="hidden" onChange={() => { }} className="opacity-0 w-0 h-0 -z-10" value={selectedOption.value} />
                            {selectedOption.icon ?
                                <Image id="selectedIcon" src={selectedOption.icon.url} className={`mr-2 ${selectedOption.icon.invert == IconTheming.LightInvert ? "dark:invert" :
                                    selectedOption.icon.invert == IconTheming.DarkInvert ? "not-dark:invert" : ""
                                    }`} width={18} height={18} alt={`${selectedOption.name} icon`} title={`${selectedOption.name} icon`} />
                                : null}
                            <span className="mr-auto text-left whitespace-nowrap overflow-visible text-ellipsis font-medium" style={{maxWidth: '100%'}}>
                                {
                                    selectedOption.activeName ? selectedOption.activeName :
                                        settings?.autoCapitilisation ? selectedOption.name[0].toUpperCase() + selectedOption.name.slice(1) :
                                            selectedOption.name.split(" - ")[0]
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
                    className={`opacity-40 ml-1.5 not-dark:invert ${!shown ? "scale-100" : "-scale-100"} transition-all`}
                />
            </button>
            <div className={`z-20 fixed top-0 left-0 w-full h-full ${!shown ? "hidden" : ""}`}></div>
            {shown && dropdownPosition && ReactDOM.createPortal(
                <div
                    id="dropdown"
                    className={`absolute w-max mx-auto dropdown transition-all z-50 ${settings?.popupVerticalAlignment == "top" ? "bottom-[calc(100%+16px)]" : "top-0"}`}
                    style={{
                        position: "absolute",
                        top: dropdownPosition.top,
                        left: dropdownPosition.left,
                        minWidth: dropdownPosition.width, // Ensure at least as wide as button
                        maxWidth: '90vw', // Don't overflow viewport
                        maxHeight: '60vh', // Limit height to 60% of viewport
                        overflowY: 'auto', // Make scrollable if too tall
                        boxSizing: 'border-box',
                        // If the dropdown would overflow the right edge, shift it left
                        ...(dropdownPosition.left + dropdownPosition.width > window.innerWidth ? {
                            left: Math.max(window.innerWidth - dropdownPosition.width - 16, 8),
                        } : {})
                    }}
                >
                    <Card
                        className="w-full text-sm !border-foreground/10 dark:border-foreground/10 appearance-none outline-none !bg-[rgb(255,255,255)] dark:!bg-[hsl(0,0%,7%)] drop-shadow-xl !rounded-xl drop-shadow-stone-800/15 dark:drop-shadow-accent/5 backdrop-blur-lg items-left *:text-start !gap-1 !px-2 !py-2"
                    >
                        {options.map((option, i) => (
                            <button key={i} disabled={option.disabled} onClick={() => {
                                setCurrentSelectionIndex(i);
                                setShown(false);
                                if (onChange) onChange(option);
                            }} data-value={option.value} className={`
                                not-disabled:cursor-pointer
                                flex
                                gap-1
                                w-full
                                disabled:opacity-50
                                ${i == currentSelectionIndex ?
                                    "bg-black/5 dark:bg-white/10" :
                                    "not-disabled:hover:bg-black/5 not-disabled:dark:hover:bg-white/5"}
                                px-3 py-2
                                rounded-lg
                                transition-all
                            `}>
                                {option.icon ?
                                    <Image src={option.icon.url} className={`mr-3 ${option.icon.invert == IconTheming.LightInvert ? "dark:invert" :
                                        option.icon.invert == IconTheming.DarkInvert ? "not-dark:invert" : ""
                                        }`} width={18} height={18} alt={`${option.name} icon`} title={`${option.name} icon`} />
                                    : null}
                                {!settings?.disableLabelsOnElements && !option.hideLabel ? label : null} <span className="font-medium">
                                    {settings?.autoCapitilisation ? option.name[0].toUpperCase() + option.name.slice(1) : option.name}
                                </span>
                                {currentSelectionIndex == i ? <Image src="/checkmark.svg" className="ml-auto not-dark:invert" width={18} height={18} alt="Selected icon" title="Selected icon" /> : null}
                            </button>
                        ))}
                    </Card>
                </div>,
                typeof window !== "undefined" ? document.body : null
            )}
        </div>
    );
}
