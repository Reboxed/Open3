// TODO: Merge the regenerate and send routes files

import { NextRequest, NextResponse } from "next/server";
import redis, { CHAT_MESSAGES_KEY, CHAT_GENERATING_KEY, USER_CHATS_KEY } from "@/internal-lib/redis";
import { Message } from "@/app/lib/types/ai";
import { getChatClass } from "@/internal-lib/utils/getChatClass";
import { getUserApiKeys, getProviderApiKey } from "@/internal-lib/utils/byok";
import { ApiError, ChatResponse } from "@/internal-lib/types/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }

    // Get user and API keys and check error: Script not found "npm"authorization
    const { requireByok, byok, user } = await getUserApiKeys();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    const { id } = await params;
    const url = new URL(req.url);
    const fromIndex = parseInt(url.searchParams.get("fromIndex") || "-1", 10);
    const prompt = url.searchParams.get("prompt") || "";
    const attachmentsParam = url.searchParams.get("attachments");
    const attachments = attachmentsParam ? JSON.parse(attachmentsParam) : [];
    if (isNaN(fromIndex) || fromIndex < 1) {
        return NextResponse.json({ error: "Invalid fromIndex" } as ApiError, { status: 400 });
    }

    const messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), 0, -1);
    const keepMessages = messageStrings.slice(0, fromIndex);
    await redis.del(CHAT_MESSAGES_KEY(id));
    if (keepMessages.length > 0) {
        await redis.rpush(CHAT_MESSAGES_KEY(id), ...keepMessages);
    }

    const rawChat = await redis.hget(USER_CHATS_KEY(user.id), id);
    let chatJson: ChatResponse | null;
    try {
        chatJson = rawChat ? { ...JSON.parse(rawChat), id } : null;
    } catch {
        chatJson = null;
    }
    if (!chatJson) return NextResponse.json({ error: "Failed to get chat" } as ApiError, { status: 404 });

    const prevMessages = keepMessages.map(msgStr => {
        try { return JSON.parse(msgStr); } catch { return null; }
    }).filter(Boolean);
    // Use provider and model from chatJson
    const apiKey = getProviderApiKey(chatJson.provider, byok);
    if (requireByok && !apiKey) {
        return NextResponse.json({ error: `API key required for ${chatJson.provider}` } as ApiError, { status: 403 });
    }
    let chat;
    try {
        chat = getChatClass(chatJson.provider, chatJson.model, prevMessages, undefined, apiKey);
    } catch (e) {
        return NextResponse.json({ error: "Unsupported chat provider" } as ApiError, { status: 400 });
    }

    const userMessage: Message = {
        role: "user",
        parts: [{ text: prompt }],
        attachments: attachments.length > 0 ? attachments : undefined
    };

    try {
        const stream = await chat.sendStream(userMessage);
        await redis.set(CHAT_GENERATING_KEY(chatJson.id), "1", "EX", 60);

        const transformedStream = new ReadableStream({
            async start(controller) {
                const reader = stream.getReader();
                let fullResponse = "";
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        // Set generating state in Redis so it doesn't expire
                        redis.set(CHAT_GENERATING_KEY(chatJson.id), "1", "EX", 60).catch(() => null);

                        const chunkText = new TextDecoder().decode(value);
                        if (chunkText.startsWith("data: ")) {
                            try {
                                fullResponse += chunkText.slice(6).trim();
                            } catch (e) {
                                // Idk what would trigger this, but just in case
                                console.error("Failed to parse chunk text:", e);
                            }
                        }
                        controller.enqueue(value);
                    }
                    if (fullResponse) {
                        const aiMessage: Message = {
                            role: "model",
                            parts: [{ text: fullResponse }]
                        };
                        await redis.rpush(CHAT_MESSAGES_KEY(id), JSON.stringify(aiMessage));
                    }
                    controller.close();
                } catch (error) {
                    controller.error(error);
                } finally {
                    await redis.del(CHAT_GENERATING_KEY(chatJson.id)).catch(() => { });
                }
            }
        });

        return new Response(transformedStream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("Failed to generate content:", error);
        return NextResponse.json({ error: "Failed to generate content", details: (error as Error).message } as ApiError, { status: 500 });
    } finally {
        // Ensure generating state is cleared even if an error occurs
        await redis.del(CHAT_GENERATING_KEY(chatJson.id)).catch((err) => {
            // This shouldn't hopefully happen or else i will shoot myself
            console.error(err);
        });
    }
}
