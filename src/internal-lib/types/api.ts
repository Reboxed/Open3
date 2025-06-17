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
export interface CreateChatResponse {
    id: string;
    label?: string;
    model: string;
    provider: string;
}

// Retrieving a chat
export interface ChatResponse extends Chat {
    id: string;
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
