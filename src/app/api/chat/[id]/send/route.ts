import { GeminiChat, Message } from "@/app/lib/types/ai";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import redis, { USER_CHATS_KEY, MESSAGES_KEY } from "@/app/lib/redis";
import { GetChat } from "../../route";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = req.nextUrl.searchParams;
    const prompt = searchParams.get('prompt');
    if (!prompt) {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const { id } = await params;
    const rawChat = await redis.hget(USER_CHATS_KEY(user.id), id);
    let chatJson: GetChat | null;
    try {
        chatJson = rawChat ? {
            ...JSON.parse(rawChat),
            id: id,
        } : null;
    } catch {
        chatJson = null;
    }
    if (!chatJson) return NextResponse.json({ error: 'Failed to get chat' }, { status: 404 });

    // Load existing messages from Redis to provide context
    const messageStrings = await redis.lrange(MESSAGES_KEY(id), 0, -1);
    const existingMessages: Message[] = messageStrings.map(msgStr => {
        try {
            return JSON.parse(msgStr);
        } catch {
            return null;
        }
    }).filter(Boolean);

    const chat = new GeminiChat(existingMessages, chatJson.model);

    // Save user message to Redis
    const userMessage: Message = {
        role: "user",
        parts: [{ text: prompt }]
    };
    await redis.rpush(MESSAGES_KEY(id), JSON.stringify(userMessage));

    try {
        const stream = await chat.sendStream(userMessage);

        // Create a custom readable stream that also saves the AI response
        const transformedStream = new ReadableStream({
            async start(controller) {
                const reader = stream.getReader();
                let fullResponse = "";
                
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        // Parse the chunk to extract the text
                        const chunkText = new TextDecoder().decode(value);
                        if (chunkText.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(chunkText.slice(6));
                                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                                    fullResponse += data.candidates[0].content.parts[0].text;
                                }
                            } catch (e) {
                                // Ignore JSON parse errors for streaming data
                            }
                        }
                        
                        controller.enqueue(value);
                    }
                    
                    // Save AI response to Redis
                    if (fullResponse) {
                        const aiMessage: Message = {
                            role: "model",
                            parts: [{ text: fullResponse }]
                        };
                        await redis.rpush(MESSAGES_KEY(id), JSON.stringify(aiMessage));
                    }
                    
                    controller.close();
                } catch (error) {
                    controller.error(error);
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
        return NextResponse.json({ error: 'Failed to generate content', details: (error as Error).message }, { status: 500 });
    }
}
