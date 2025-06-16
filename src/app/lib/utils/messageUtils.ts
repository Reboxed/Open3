"use client";

import { Message } from "../types/ai";

export async function loadMessagesFromServer(chatId: string, offset = 0, limit = 25): Promise<{
    messages: Message[];
    generating: boolean;
    total: number;
    offset: number;
    limit: number;
}> {
    try {
        const response = await fetch(`/api/chat/${chatId}/messages?offset=${offset}&limit=${limit}`);
        if (!response.ok) {
            console.error('Failed to load messages:', response.statusText);
            return { messages: [], generating: false, total: 0, offset, limit };
        }
        const data = await response.json();
        return {
            messages: data.messages || [],
            generating: data.generating ?? false,
            total: data.total ?? 0,
            offset: data.offset ?? offset,
            limit: data.limit ?? limit
        };
    } catch (error) {
        console.error('Error loading messages:', error);
        return { messages: [], generating: false, total: 0, offset, limit };
    }
}

export async function saveMessageToServer(chatId: string, message: Message): Promise<boolean> {
    try {
        const response = await fetch(`/api/chat/${chatId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
        });
        return response.ok;
    } catch (error) {
        console.error('Error saving message:', error);
        return false;
    }
}

export async function clearMessagesFromServer(chatId: string): Promise<boolean> {
    try {
        const response = await fetch(`/api/chat/${chatId}/messages`, {
            method: 'DELETE',
        });
        return response.ok;
    } catch (error) {
        console.error('Error clearing messages:', error);
        return false;
    }
}

// Migrate messages from localStorage to Redis (for existing users)
export async function migrateMessagesFromLocalStorage(chatId: string): Promise<void> {
    const MESSAGES_ID = `messages-${chatId}`;
    const savedMessages = localStorage.getItem(MESSAGES_ID);

    if (savedMessages) {
        try {
            const messages: Message[] = JSON.parse(savedMessages);
            for (const message of messages) await saveMessageToServer(chatId, message)

            localStorage.removeItem(MESSAGES_ID);
            console.log(`Migrated ${messages.length} messages for chat ${chatId}`);
        } catch (error) {
            console.error('Error migrating messages:', error);
        }
    }
}
