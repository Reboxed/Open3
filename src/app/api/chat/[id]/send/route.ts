import { GeminiChat, Message } from "@/app/lib/types/ai";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import redis, { USER_CHATS_KEY, CHAT_MESSAGES_KEY, CHAT_GENERATING_KEY, USER_FILES_KEY, GET_LOOKUP_KEY } from "@/app/lib/redis";
import { GetChat } from "../../route";
import eventBus, { CHAT_TITLE_GENERATE_EVENT } from "@/app/lib/eventBus";
import { join } from "path";
import { readFile } from "fs/promises";
//import { URL_PREFIX } from "@/app/api/upload/route";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const prompt = searchParams.get('prompt');
    if (!prompt) {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Get attachments from the request
    const attachmentsParam = searchParams.get('attachments');
    const attachments = attachmentsParam ? JSON.parse(attachmentsParam) : [];

    const isGenerating = await redis.get(CHAT_GENERATING_KEY(id));
    if (isGenerating) {
        return NextResponse.json({ error: "You're already generating in this chat." }, { status: 400 });
    }

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
    const messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), 0, -1);
    const existingMessages: Message[] = messageStrings.map(msgStr => {
        try {
            return JSON.parse(msgStr);
        } catch { return null }
    }).filter(Boolean);

    const chat = new GeminiChat(existingMessages, chatJson.model);

    // Save user message to Redis
    const userMessage: Message = {
        role: "user",
        parts: [{ text: prompt }],
        attachments: attachments.length > 0 ? attachments : undefined
    };

    // Prepare file data for attachments and inject into parts
    const uploadsDir = join(process.cwd(), "public", "uploads");
    for (let i = 0; i < (userMessage.attachments ?? []).length; i++) {
        const attachment = userMessage.attachments?.[i];
        if (!attachment || !attachment.filename) continue;

        const originalName = attachment.filename;
        const nulledLookupKey = GET_LOOKUP_KEY(user.id, null, originalName);
        let randomName = await redis.get(nulledLookupKey);
        let foundWithNull = true;
        if (!randomName) {
            const chatLookupKey = GET_LOOKUP_KEY(user.id, chatJson.id, originalName);
            randomName = await redis.get(chatLookupKey);
            foundWithNull = false;
            if (!randomName) continue;
        }
        const chatLookupKey = GET_LOOKUP_KEY(user.id, chatJson.id, originalName);
        if (foundWithNull) {
            await redis.set(chatLookupKey, randomName);
            await redis.del(nulledLookupKey);
        }
        const file = await redis.hget(USER_FILES_KEY(user.id), randomName);
        let fileMeta = null;
        if (file) {
            const fileJson = JSON.parse(file);
            if (fileJson.chat !== chatJson.id) {
                await redis.hset(USER_FILES_KEY(user.id), randomName, JSON.stringify({
                    ...fileJson,
                    chat: chatJson.id,
                }));
            }
            fileMeta = fileJson;
        }
        // Read file from disk and inject into parts
        try {
            const filePath = join(uploadsDir, randomName);
            const metaPath = filePath + ".meta.json";
            const fileBuffer = await readFile(filePath);
            let meta = fileMeta;
            try {
                const metaRaw = await readFile(metaPath, "utf8");
                meta = JSON.parse(metaRaw);
            } catch {}
            const ext = originalName.split('.').pop()?.toLowerCase() || "";
            const isImage = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(ext);
            if (isImage) {
                userMessage.parts.push({
                    inlineData: {
                        mimeType: meta?.mimeType || "application/octet-stream",
                        data: fileBuffer.toString("base64")
                    }
                });
            } else {
                // Try to read as text, fallback to metadata
                let text = null;
                try {
                    text = fileBuffer.toString("utf8");
                    // Check for binary content
                    if (/^[\x00-\x08\x0E-\x1F\x7F-\x9F]/.test(text)) {
                        throw new Error('Binary content');
                    }
                } catch {
                    text = null;
                }
                const fileType = meta?.mimeType || "application/octet-stream";
                const fileSize = fileBuffer.length;
                const fileInfo = `[File: ${originalName} (${fileType}, ${(fileSize / 1024).toFixed(1)}KB)]`;
                if (text) {
                    userMessage.parts.push({
                        text: `${fileInfo}\nContent:\n${text}`
                    });
                } else {
                    const metadata = {
                        type: fileType,
                        size: fileSize,
                        name: originalName
                    };
                    userMessage.parts.push({
                        text: `${fileInfo}\nMetadata: ${JSON.stringify(metadata, null, 2)}`
                    });
                }
            }
        } catch (error) {
            userMessage.parts.push({
                text: `[Failed to process file: ${originalName}]`
            });
        }
    }

    try {
        if (!chatJson.label) {
            const emitted = eventBus.emit(CHAT_TITLE_GENERATE_EVENT, id, [userMessage.parts[0].text]);
            if (!emitted) {
                console.log(`Emitting failed for chat ${id}.`);
            }
        }

        const stream = await chat.sendStream(userMessage);
        await redis.rpush(CHAT_MESSAGES_KEY(id), JSON.stringify(userMessage));

        const genResult = await redis.set(CHAT_GENERATING_KEY(chatJson.id), "1", "EX", 60).catch((err) => {
            console.error(err);
            return null;
        });
        if (!genResult) {
            // Shouldn't happen unless a user is naughty and bypasses the GUI.
            return NextResponse.json({ error: "Failed to set generating state" }, { status: 500 })
        }

        // Create a custom readable stream that also saves the AI response
        const transformedStream = new ReadableStream({
            async start(controller) {
                const reader = stream.getReader();
                let fullResponse = "";

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        redis.set(CHAT_GENERATING_KEY(chatJson.id), "1", "EX", 60).catch((err) => {
                            console.error(err);
                            return null;
                        });

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
                        await redis.rpush(CHAT_MESSAGES_KEY(id), JSON.stringify(aiMessage));
                    }

                    controller.close();
                } catch (error) {
                    console.error(error);
                    controller.error(error);
                } finally {
                    await redis.del(CHAT_GENERATING_KEY(chatJson.id)).catch((err) => {
                        // This shouldn't hopefully happen or else i will shoot myself
                        console.error(err);
                    });
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
    } finally {
        await redis.del(CHAT_GENERATING_KEY(chatJson.id)).catch((err) => {
            // This shouldn't hopefully happen or else i will shoot myself
            console.error(err);
        });
    }
}
