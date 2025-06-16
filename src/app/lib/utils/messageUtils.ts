"use client";

import { Message } from "../types/ai";

// Load messages from Redis via API
export async function loadMessagesFromServer(chatId: string): Promise<Message[]> {
    try {
        const response = await fetch(`/api/chat/${chatId}/messages`);
        if (!response.ok) {
            console.error('Failed to load messages:', response.statusText);
            return [];
        }
        const data = await response.json();
        return data.messages || [];
    } catch (error) {
        console.error('Error loading messages:', error);
        return [];
    }
}

// Save a message to Redis via API
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

// Clear messages for a chat
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
            
            // Save each message to the server
            for (const message of messages) {
                await saveMessageToServer(chatId, message);
            }
            
            // Remove from localStorage after successful migration
            localStorage.removeItem(MESSAGES_ID);
            console.log(`Migrated ${messages.length} messages for chat ${chatId}`);
        } catch (error) {
            console.error('Error migrating messages:', error);
        }
    }
}
