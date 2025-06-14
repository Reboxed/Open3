"use client";

import { Tab } from "../../components/Tabs";

const TABS_LS_NAME = "tabs";
export function getTabs(localStorage: Storage): Tab[] {
    try {
        const tabs = JSON.parse(localStorage.getItem(TABS_LS_NAME) ?? "[]");
        if (!(tabs instanceof Array) || !tabs) {
            return [];
        }
        return tabs as Tab[];
    } catch {
        return [];
    }
}

export function setTabs(localStorage: Storage, tabs: Tab[]) {
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].active = false;
    }
    localStorage.setItem(TABS_LS_NAME, JSON.stringify(tabs));
}

export function addTabs(localStorage: Storage, ...tabs: Tab[]) {
    const currentTabs = getTabs(localStorage);
    for (const tab of tabs) {
        if (currentTabs.find(t => t.id === tab.id)) continue;
        tab.active = false;
        currentTabs.push(tab);
    }
    setTabs(localStorage, currentTabs);
}

