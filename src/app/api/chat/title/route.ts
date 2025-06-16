import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { USER_CHATS_KEY } from "@/app/lib/redis";
import { GetChat } from "../route";
import { GoogleGenAI, PartUnion } from "@google/genai";
import eventBus, { CHAT_TITLE_GENERATE_EVENT } from "@/app/lib/eventBus";
import { NEW_TITLE_EVENT } from "@/app/lib/constants";
import { TITLE_PROMPT } from "@/constants";


export async function GET(_: NextRequest) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!user.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let eventListener: ((chatId: string, messages: string[]) => Promise<void>) | null = null;
    const generatingChats = new Set<string>();
    let isClosed = false;

    const stream = new ReadableStream({
        async start(streamController) {
            controller = streamController;
            
            // Create event listener function
            eventListener = async (chatId: string, messages: string[]) => {
                if (isClosed || !controller) return;
                if (generatingChats.has(chatId)) return; // Prevent duplicate processing
                
                generatingChats.add(chatId);

                try {
                    const rawChat = await redis!.hget(USER_CHATS_KEY(user.userId), chatId);
                    let chat: GetChat | null = null;
                    
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
                        
                        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEN_AI_API_KEY });
                        const result = await ai.models.generateContentStream({
                            model: "gemini-1.5-flash",
                            config: {
                                systemInstruction: TITLE_PROMPT,
                            },
                            contents: messages.map(msg => ({ role: "user", text: msg } as PartUnion)),
                        });

                        for await (const chunk of result) {
                            if (isClosed || !controller) break;
                            
                            const text = chunk.text;
                            if (text) {
                                fullResponse += text;
                                try {
                                    controller.enqueue(new TextEncoder().encode(`data: ${chatId}::${fullResponse}\n\n`));
                                } catch (enqueueError) {
                                    console.error(`Failed to enqueue chunk for chat ${chatId}:`, enqueueError);
                                    break;
                                }
                            }
                        }

                        // Save the final title to Redis
                        const finalTitle = fullResponse.trim() || "Untitled Chat";
                        await redis!.hset(USER_CHATS_KEY(user.userId), chatId, JSON.stringify({
                            ...chat,
                            label: finalTitle,
                        } as GetChat));

                        console.log(`Generated title for chat ${chatId}: ${finalTitle}`);
                    } catch (error) {
                        console.error(`Error generating title for chat ${chatId}:`, error);
                        
                        // Try to save fallback title
                        try {
                            const fallbackTitle = fullResponse.trim() || "Untitled Chat";
                            await redis!.hset(USER_CHATS_KEY(user.userId), chatId, JSON.stringify({
                                ...chat,
                                label: fallbackTitle,
                            } as GetChat));
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
