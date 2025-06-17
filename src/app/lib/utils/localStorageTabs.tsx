"use client";

import { Tab } from "../../components/Tabs";

const TABS_LS_NAME = "tabs";
export function loadTabsLocally(localStorage: Storage): Tab[] {
    try {
        const tabs = JSON.parse(localStorage.getItem(TABS_LS_NAME) ?? "[]");
        if (!(tabs instanceof Array) || !tabs) return [];
        return tabs as Tab[];
    } catch (e) {
        console.warn("Failed to parse tabs from localStorage:", e);
        return [];
    }
}

export function saveTabsLocally(localStorage: Storage, tabs: Tab[]) {
    localStorage.setItem(TABS_LS_NAME, JSON.stringify(tabs));
}

export function addAndSaveTabsLocally(localStorage: Storage, ...tabs: Tab[]) {
    const currentTabs = loadTabsLocally(localStorage);
    for (const tab of tabs) {
        if (currentTabs.find(t => t.id === tab.id)) continue;
        tab.active = false;
        currentTabs.push(tab);
    }
    saveTabsLocally(localStorage, currentTabs);
}

