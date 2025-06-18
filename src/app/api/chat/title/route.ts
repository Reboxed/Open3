import { NextRequest, NextResponse } from "next/server";
import { USER_CHATS_KEY } from "@/internal-lib/redis";
import eventBus, { CHAT_TITLE_GENERATE_EVENT } from "@/internal-lib/eventBus";
import { NEW_TITLE_EVENT } from "@/internal-lib/constants";
import { TITLE_PROMPT } from "@/internal-lib/constants";
import { getUserApiKeys, getProviderApiKey } from "@/internal-lib/utils/byok";
import { getChatClass } from "@/internal-lib/utils/getChatClass";
import { ApiError, ChatResponse } from "@/internal-lib/types/api";


export async function GET(_: NextRequest) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }

    const { requireByok, byok, user } = await getUserApiKeys();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let eventListener: ((chatId: string, messages: string[]) => Promise<void>) | null = null;
    const generatingChats = new Set<string>();
    let isClosed = false;

    // This stream is kinda not the best but i mean it works just fine 🤷‍♂️
    const stream = new ReadableStream({
        async start(streamController) {
            controller = streamController;
            
            // Create event listener function
            const eventListener = async (chatId: string, messages: string[]) => {
                if (isClosed || !controller) return;
                // Prevent duplicate processing
                if (generatingChats.has(chatId)) return;
                generatingChats.add(chatId);

                try {
                    const rawChat = await redis!.hget(USER_CHATS_KEY(user.id), chatId);
                    let chat: ChatResponse | null = null;
                    
                    try {
                        chat = rawChat ? {
                            ...JSON.parse(rawChat),
                            id: chatId,
                        } : null;
                    } catch (parseError) {
                        console.error(`Failed to parse chat ${chatId}:`, parseError);
                        generatingChats.delete(chatId);
                        return;
                    }
                    
                    if (!chat) {
                        console.error(`Chat ${chatId} not found`);
                        generatingChats.delete(chatId);
                        return;
                    }

                    let fullResponse = "";
                    try {
                        // Send initial event
                        if (!isClosed && controller) {
                            controller.enqueue(new TextEncoder().encode(`data: ${chatId}::${NEW_TITLE_EVENT}\n\n`));
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
                            return NextResponse.json({ error: "Unsupported chat provider" } as ApiError, { status: 400 });
                        }

                        const readableStream = await chat.sendStream({
                            parts: [{ text: messages[messages.length - 1 ]}],
                            role: "user",
                        }, 25);

                        const reader = readableStream.getReader();
                        while (true) {
                            if (isClosed || !controller) break;
                            const { done, value } = await reader.read();
                            if (done) break;

                            const text = new TextDecoder().decode(value);
                            if (text.startsWith("data: ")) {
                                fullResponse += text.slice(6);
                                try {
                                    controller.enqueue(new TextEncoder().encode(`data: ${chatId}::${fullResponse}\n\n`));
                                } catch (enqueueError) {
                                    console.error(`Failed to enqueue chunk for chat ${chatId}:`, enqueueError);
                                    break;
                                }
                            }
                        }
                        reader.releaseLock();

                        // Save the final title to Redis
                        const finalTitle = fullResponse.trim() || "Untitled Chat";
                        await redis!.hset(USER_CHATS_KEY(user.id), chatId, JSON.stringify({
                            ...chat,
                            label: finalTitle,
                        } as ChatResponse));
                    } catch (error) {
                        console.error(`Error generating title for chat ${chatId}:`, error);
                        
                        // Try to save fallback title
                        try {
                            const fallbackTitle = fullResponse.trim() || "Untitled Chat";
                            await redis!.hset(USER_CHATS_KEY(user.id), chatId, JSON.stringify({
                                ...chat,
                                label: fallbackTitle,
                            } as ChatResponse));
                        } catch (saveError) {
                            console.error(`Failed to set fallback title for ${chatId}:`, saveError);
                        }
                    }
                } catch (outerError) {
                    console.error(`Outer error processing chat ${chatId}:`, outerError);
                } finally {
                    generatingChats.delete(chatId);
                }
            };

            // Add the event listener
            eventBus.on(CHAT_TITLE_GENERATE_EVENT, eventListener);
            
            // Send initial connection confirmation
            try {
                controller.enqueue(new TextEncoder().encode(`data: connected\n\n`));
            } catch (error) {
                console.error("Failed to send initial connection message:", error);
            }
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
                eventListener = null;
            }
            generatingChats.clear();
            controller = null;
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
