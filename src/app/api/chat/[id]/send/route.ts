import { Message } from "@/app/lib/types/ai";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import redis, { USER_CHATS_KEY, CHAT_MESSAGES_KEY, CHAT_GENERATING_KEY } from "@/app/lib/redis";
import { GetChat } from "../../route";
import eventBus, { CHAT_TITLE_GENERATE_EVENT } from "@/app/lib/eventBus";
import { join } from "path";
import { getUserApiKeys, getProviderApiKey } from "@/app/lib/utils/byok";
import { getChatClass } from "@/app/lib/utils/getChatClass";

// Helper to load file data for an attachment and return parts to inject
async function getAttachmentParts({ userId, chatId, originalName, uploadsDir }: { userId: string, chatId: string, originalName: string, uploadsDir: string }) {
    const { GET_LOOKUP_KEY, USER_FILES_KEY } = await import("@/app/lib/redis");
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const nulledLookupKey = GET_LOOKUP_KEY(userId, null, originalName);
    let randomName = await redis.get(nulledLookupKey);
    let foundWithNull = false;
    if (!randomName) {
        const chatLookupKey = GET_LOOKUP_KEY(userId, chatId, originalName);
        randomName = await redis.get(chatLookupKey);
        if (!randomName) return [];
    } else {
        foundWithNull = true;
    }
    // If found with null, update lookup to chatId and delete null lookup
    if (foundWithNull) {
        const chatLookupKey = GET_LOOKUP_KEY(userId, chatId, originalName);
        await redis.set(chatLookupKey, randomName);
        await redis.del(nulledLookupKey);
        // Also update the file meta to set chat to chatId if it was null
        const file = await redis.hget(USER_FILES_KEY(userId), randomName);
        if (file) {
            let fileMeta;
            try { fileMeta = JSON.parse(file); } catch { fileMeta = null; }
            if (fileMeta && (fileMeta.chat === null || fileMeta.chat === undefined)) {
                await redis.hset(USER_FILES_KEY(userId), randomName, JSON.stringify({
                    ...fileMeta,
                    chat: chatId,
                }));
            }
        }
    }
    let fileMeta = null;
    const file = await redis.hget(USER_FILES_KEY(userId), randomName);
    if (file) {
        try { fileMeta = JSON.parse(file); } catch { }
    }
    try {
        const filePath = join(uploadsDir, randomName);
        const metaPath = filePath + ".meta.json";
        const fileBuffer = await readFile(filePath);
        let meta = fileMeta;
        try {
            const metaRaw = await readFile(metaPath, "utf8");
            meta = JSON.parse(metaRaw);
        } catch { }
        const ext = originalName.split('.').pop()?.toLowerCase() || "";
        const isImage = ["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(ext);
        if (isImage) {
            return [{
                inlineData: {
                    filename: originalName,
                    size: fileBuffer.length,
                    mimeType: meta?.mimeType || "application/octet-stream",
                    data: fileBuffer.toString("base64")
                }
            }];
        } else {
            let text = null;
            try {
                text = fileBuffer.toString("utf8");
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
                return [{
                    text: `${fileInfo}\nContent:\n${text}`
                }];
            } else {
                const metadata = {
                    type: fileType,
                    size: fileSize,
                    name: originalName
                };
                return [{
                    text: `${fileInfo}\nMetadata: ${JSON.stringify(metadata, null, 2)}`
                }];
            }
        }
    } catch {
        return [{ text: `[Failed to process file: ${originalName}]` }];
    }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const { requireByok, byok, user } = await getUserApiKeys();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const prompt = searchParams.get('prompt');
    if (!prompt) {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const requestedModel = searchParams.get('model');
    const requestedProvider = searchParams.get('provider');

    const attachmentsParam = searchParams.get('attachments');
    const attachments = attachmentsParam ? JSON.parse(attachmentsParam) : [];

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

    const messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), 0, -1);
    const existingMessages: Message[] = messageStrings.map(msgStr => {
        try {
            return JSON.parse(msgStr);
        } catch { return null }
    }).filter(Boolean);

    // For each message with attachments, reload file data from disk and inject into parts
    const uploadsDir = join(process.cwd(), "public", "uploads");
    for (const msg of existingMessages) {
        if (msg.attachments && msg.attachments.length > 0) {
            for (const attachment of msg.attachments) {
                if (!attachment.filename) continue;
                const parts = await getAttachmentParts({ userId: user.id, chatId: id, originalName: attachment.filename, uploadsDir });
                if (!msg.parts) msg.parts = [];
                msg.parts.push(...parts);
            }
        }
    }

    const chatModel = requestedModel || chatJson.model;
    const chatProvider = requestedProvider || chatJson.provider;

    // BYOK enforcement
    const apiKey = getProviderApiKey(chatProvider, byok);
    if (requireByok && !apiKey) {
        return NextResponse.json({ error: `API key required for ${chatProvider}` }, { status: 403 });
    }

    let chat;
    try {
        // Pass apiKey to getChatClass
        chat = getChatClass(chatProvider, chatModel, existingMessages, undefined, apiKey);
    } catch (e) {
        return NextResponse.json({ error: 'Unsupported chat provider' }, { status: 400 });
    }

    // Save user message to Redis (only file paths in attachments, no file data in parts)
    const userMessage: Message = {
        role: "user",
        parts: [{ text: prompt }],
        attachments: attachments.length > 0 ? attachments : undefined
    };

    // Prepare runtime message for AI: clone userMessage and inject loaded file data into parts
    const runtimeUserMessage: Message = {
        ...userMessage,
        parts: [...userMessage.parts],
    };
    if (userMessage.attachments && userMessage.attachments.length > 0) {
        const runtimePartsArrays = await Promise.all(
            userMessage.attachments.map(att =>
                att && att.filename
                    ? getAttachmentParts({ userId: user.id, chatId: chatJson.id, originalName: att.filename, uploadsDir })
                    : Promise.resolve([])
            )
        );
        for (const parts of runtimePartsArrays) {
            runtimeUserMessage.parts.push(...parts);
        }
    }

    // Store only the original userMessage (no loaded file data) in Redis
    await redis.rpush(CHAT_MESSAGES_KEY(id), JSON.stringify(userMessage));

    try {
        if (!chatJson.label) {
            const emitted = eventBus.emit(CHAT_TITLE_GENERATE_EVENT, id, [userMessage.parts[0].text]);
            if (!emitted) {
                console.log(`Emitting failed for chat ${id}.`);
            }
        }

        const stream = await chat.sendStream(runtimeUserMessage);
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
                                fullResponse += chunkText.slice(6).trim();
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
                    // Send SSE error event to client before closing
                    const errorMsg = JSON.stringify({ error: 'stream-failure', message: (error as Error).message });
                    controller.enqueue(new TextEncoder().encode(`event: error\ndata: ${errorMsg}\n\n`));
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
        console.error("Error during chat generation:", error);
        return NextResponse.json({ error: 'Failed to generate content', details: (error as Error).message }, { status: 500 });
    } finally {
        await redis.del(CHAT_GENERATING_KEY(chatJson.id)).catch((err) => {
            // This shouldn't hopefully happen or else i will shoot myself
            console.error(err);
        });
    }
}
