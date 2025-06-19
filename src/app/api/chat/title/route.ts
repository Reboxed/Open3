import { NextRequest, NextResponse } from "next/server";
import { USER_CHATS_KEY } from "@/internal-lib/redis";
import eventBus, { CHAT_TITLE_GENERATE_EVENT } from "@/internal-lib/eventBus";
import { NEW_TITLE_EVENT } from "@/internal-lib/constants";
import { TITLE_PROMPT } from "@/internal-lib/constants";
import { getUserApiKeys, getProviderApiKey } from "@/internal-lib/utils/byok";
import { getChatClass } from "@/internal-lib/utils/getChatClass";
import { ApiError, ChatResponse } from "@/internal-lib/types/api";
import { currentUser } from "@clerk/nextjs/server";
import { ChunkResponse } from "@/app/lib/types/ai";


export async function GET(_: NextRequest) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    const { requireByok, byok } = await getUserApiKeys(user);
    console.log()

    let eventListener: (chatId: string, messages: string[]) => Promise<void>;
    const generatingChats = new Set<string>();
    let isClosed = false;

    // This stream is kinda not the best but i mean it works just fine 🤷‍♂️
    const stream = new ReadableStream({
        async start(controller) {
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();

            // Create event listener function
            eventListener = async (chatId: string, messages: string[]) => {
                chatId = chatId.trim();
                if (isClosed || !controller) return;
                // Prevent duplicate processing
                if (generatingChats.has(chatId)) return;

                try {
                    if (!redis) {
                        throw new Error("Redis connection failure");
                    }

                    let rawChat: string | null = null;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        rawChat = await redis.hget(USER_CHATS_KEY(user.id), chatId);
                        if (rawChat) break;
                        if (attempt < 3) await new Promise(res => setTimeout(res, 1000));
                    }
                    if (!rawChat) {
                        controller.enqueue(encoder.encode(`event: error\ndata: Chat ${chatId} not found after 3 attempts\n\n`));
                        return;
                    }
                    let rawChatJson: { [key: string]: any } = {};
                    let chat: ChatResponse | null = null;
                    try {
                        rawChatJson = JSON.parse(rawChat.trim());
                        chat = rawChat ? {
                            ...rawChatJson as any,
                            id: chatId,
                        } : null;
                    } catch (parseError) {
                        controller.enqueue(encoder.encode(`event: error\ndata: Failed to parse chat ${chatId}\n\n`));
                        return;
                    }
                    if (!chat) {
                        console.error(`Chat ${chatId} not found`);
                        controller.enqueue(encoder.encode(`event: error\ndata: Chat ${chatId} not found\n\n`));
                        return;
                    }

                    generatingChats.add(chatId);
                    let fullResponse = "";
                    try {
                        // Send initial event
                        if (!isClosed && controller) {
                            controller.enqueue(encoder.encode(`event: ${NEW_TITLE_EVENT}\ndata: ${chatId}\n\n`));
                        }
                        // BYOK enforcement for Gemini
                        const apiKey = getProviderApiKey("openrouter", byok);
                        if (requireByok && !apiKey) {
                            throw new Error("API key required for Gemini (Google)");
                        }

                        let chat;
                        try {
                            chat = getChatClass("openrouter", "google/gemini-flash-1.5", messages.slice(0, -2), TITLE_PROMPT, apiKey);
                        } catch (e) {
                            controller.enqueue(encoder.encode(`event: error\ndata: Unsupported chat provider\n\n`));
                            return;
                        }

                        const readableStream = await chat.sendStream({
                            parts: [{ text: messages[messages.length - 1] }],
                            role: "user",
                        }, false, 75);

                        const reader = readableStream.getReader();
                        while (true) {
                            if (isClosed || !controller) break;
                            const { done, value } = await reader.read();
                            if (done) break;

                            // Parse the chunk to extract the text
                            const chunk = decoder.decode(value);
                            try {
                                const parsed = JSON.parse(chunk) as ChunkResponse;
                                fullResponse += parsed.content;
                                try {
                                    controller.enqueue(encoder.encode(`data: ${chatId}::${fullResponse}\n\n`));
                                } catch (enqueueError) {
                                    console.error(`Failed to enqueue chunk for chat ${chatId}:`, enqueueError);
                                    break;
                                }
                            } catch (e) {
                                // Idk what would trigger this, but just in case
                                console.error("Failed to parse chunk text:", e);
                            }
                        }

                        // Save the final title to Redis
                        const finalTitle = fullResponse.trim() || "Untitled Chat";
                        await redis.hset(USER_CHATS_KEY(user.id), chatId, JSON.stringify({
                            ...rawChatJson,
                            label: finalTitle,
                        } as ChatResponse));
                    } catch (error) {
                        console.error(`Error generating title for chat ${chatId}:`, error);

                        // Try to save fallback title
                        try {
                            const fallbackTitle = fullResponse.trim() || "Untitled Chat";
                            await redis.hset(USER_CHATS_KEY(user.id), chatId, JSON.stringify({
                                ...chat,
                                label: fallbackTitle,
                            } as ChatResponse));
                        } catch (saveError) {
                            console.error(`Failed to set fallback title for ${chatId}:`, saveError);
                        }
                    } finally { fullResponse = "" }
                } catch (outerError) {
                    controller.enqueue(encoder.encode(`event: error\ndata: Failed to process chat ${chatId}\n\n`));
                    // console.error(`Outer error processing chat ${chatId}:`, outerError);
                } finally {
                    generatingChats.delete(chatId);
                }
            };

            // Add the event listener
            eventBus.on(CHAT_TITLE_GENERATE_EVENT, eventListener);
        },

        cancel() {
            // Clean up when stream is cancelled/closed
            isClosed = true;
            if (eventListener) {
                try {
                    eventBus.removeListener(CHAT_TITLE_GENERATE_EVENT, eventListener);
                } catch (error) {
                    console.error("Failed to remove event listener:", error);
                }
            }
            generatingChats.clear();
            console.log("Title stream connection closed and cleaned up");
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
        },
    });
}
