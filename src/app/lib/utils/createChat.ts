"use server";

import { CreateChatRequest, CreateChatResponse, GetChat } from "@/app/api/chat/route";
import { GeminiChat } from "../types/ai";
import { USER_CHATS_INDEX_KEY, USER_CHATS_KEY } from "../redis";

export async function createChat(userId: string, { model, provider }: CreateChatRequest): Promise<CreateChatResponse> {
    if (!redis) throw "Redis connection failure";

    const id = crypto.randomUUID();
    // TODO: Provider
    const chat = new GeminiChat([], model ?? "gemini-2.0-flash"); // TODO: make it use the model
    chat.provider = provider;

    const result = await redis.multi()
        .hset(USER_CHATS_KEY(userId), id, JSON.stringify({
            model: chat.model,
            provider: chat.provider,
            createdAt: Date.now(),
        } as GetChat))
        .zadd(USER_CHATS_INDEX_KEY(userId), Date.now(), id)
        .exec();

    // Check for failure
    if (!result || result.some(([err]) => err)) {
        // Optionally: clean up in case partial state exists
        await redis.hdel(USER_CHATS_KEY(userId), id);
        throw new Error("Failed to save chat to Redis");
    }

    return {
        id,
        model,
        provider
    };
}
