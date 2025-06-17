import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import redis, { CHAT_MESSAGES_KEY, CHAT_GENERATING_KEY, USER_CHATS_KEY } from "@/app/lib/redis";
import { GetChat } from "../../route";
import { Message } from "@/app/lib/types/ai";
import { getChatClass } from "@/app/lib/utils/getChatClass";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    if (!redis) {
        return new Response(JSON.stringify({ error: "Redis connection failure" }), { status: 500 });
    }
    const user = await currentUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    if (user.banned) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    const { id } = params;
    const url = new URL(req.url);
    const fromIndex = parseInt(url.searchParams.get("fromIndex") || "-1", 10);
    const prompt = url.searchParams.get("prompt") || "";
    const attachmentsParam = url.searchParams.get("attachments");
    const attachments = attachmentsParam ? JSON.parse(attachmentsParam) : [];
    if (isNaN(fromIndex) || fromIndex < 1) {
        return new Response(JSON.stringify({ error: "Invalid fromIndex" }), { status: 400 });
    }
    
    const messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), 0, -1);
    const keepMessages = messageStrings.slice(0, fromIndex);
    await redis.del(CHAT_MESSAGES_KEY(id));
    if (keepMessages.length > 0) {
        await redis.rpush(CHAT_MESSAGES_KEY(id), ...keepMessages);
    }
    
    const rawChat = await redis.hget(USER_CHATS_KEY(user.id), id);
    let chatJson: GetChat | null;
    try {
        chatJson = rawChat ? { ...JSON.parse(rawChat), id } : null;
    } catch {
        chatJson = null;
    }
    if (!chatJson) return new Response(JSON.stringify({ error: 'Failed to get chat' }), { status: 404 });
    
    const prevMessages = keepMessages.map(msgStr => {
        try { return JSON.parse(msgStr); } catch { return null; }
    }).filter(Boolean);
    // Use provider and model from chatJson
    let chat;
    try {
        chat = getChatClass(chatJson.provider, chatJson.model, prevMessages);
    } catch (e) {
        return NextResponse.json({ error: 'Unsupported chat provider' }, { status: 400 });
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
                        redis.set(CHAT_GENERATING_KEY(chatJson.id), "1", "EX", 60).catch(() => null);
                        const chunkText = new TextDecoder().decode(value);
                        if (chunkText.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(chunkText.slice(6));
                                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                                    fullResponse += data.candidates[0].content.parts[0].text;
                                }
                            } catch {}
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
                    await redis.del(CHAT_GENERATING_KEY(chatJson.id)).catch(() => {});
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
        return new Response(JSON.stringify({ error: 'Failed to generate content', details: (error as Error).message }), { status: 500 });
    } finally {
        await redis.del(CHAT_GENERATING_KEY(chatJson.id)).catch(() => {});
    }
}
