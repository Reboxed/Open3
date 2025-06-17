"use client";

import { Message } from "../types/ai";

export async function loadMessagesFromServer(chatId: string): Promise<{
    messages: Message[];
    generating: boolean;
}> {
    try {
        const response = await fetch(`/api/chat/${chatId}/messages`);
        if (!response.ok) {
            // console.error('Failed to load messages:", response.statusText);
            return { messages: [], generating: false };
        }
        const data = await response.json();
        return {
            messages: data.messages || [],
            generating: data.generating ?? false,
        };
    } catch (error) {
        console.error("Error loading messages:", error);
        return { messages: [], generating: false };
    }
}

export async function clearMessagesFromServer(chatId: string): Promise<boolean> {
    try {
        const response = await fetch(`/api/chat/${chatId}/messages`, {
            method: "DELETE",
        });
        return response.ok;
    } catch (error) {
        console.error("Error clearing messages:", error);
        return false;
    }
}
