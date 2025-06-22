"use client";

import { Message } from "../types/ai";

export async function loadMessagesFromServer(chatId: string, opts?: {
    page?: number;
    limit?: number;
    reverse: boolean;
}): Promise<{
    messages: Message[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}> {
    try {
        // Validate parameters
        const parameters = new URLSearchParams();
        if (opts?.page) parameters.append("page", opts.page.toString());
        if (opts?.limit) parameters.append("limit", opts.limit.toString());
        if (opts?.reverse) parameters.append("reverse", opts.reverse.toString());

        const response = await fetch(`/api/chat/${chatId}/messages?${parameters.toString()}`);
        if (!response.ok) {
            // console.error('Failed to load messages:", response.statusText);
            return { messages: [], total: 0, page: 1, limit: 10, hasMore: false };
        }
        const data = await response.json();
        return {
            messages: data.messages || [],
            total: data.total || 0,
            page: data.page || 1,
            limit: data.limit || 10,
            hasMore: data.hasMore || false,
        };
    } catch (error) {
        console.error("Error loading messages:", error);
        return { messages: [], total: 0, page: 1, limit: 10, hasMore: false };
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
