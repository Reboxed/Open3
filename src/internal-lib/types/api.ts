import { Chat } from "@/app/lib/types/ai";

export interface ApiError {
    error: string;
    details?: any;
}

// Creating a chat
export interface CreateChatRequest {
    model: string;
    provider: string;
}
// TOOD: I realized this type basically exists twice just now, i will clean that up later
export interface CreateChatResponse {
    id: string;
    label?: string;
    pinned?: boolean;
    model: string;
    provider: string;
}

// TODO: HELP WHY ARE THERE SO MANY SCATTERED TYPES OF THE SAME THING???
// Retrieving a chat
export interface ChatResponse extends Chat {
    id: string;
    pinned?: boolean;
    createdAt?: number;
}
// Retrieving several chats
export interface GetChatsResponse {
    chats: ChatResponse[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}
