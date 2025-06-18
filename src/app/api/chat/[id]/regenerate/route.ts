// TODO: Merge the regenerate and send routes files

import { Message } from "@/app/lib/types/ai";
import { NextRequest, NextResponse } from "next/server";
import redis, { USER_CHATS_KEY, CHAT_MESSAGES_KEY, CHAT_GENERATING_KEY, MESSAGE_STREAM_KEY } from "@/internal-lib/redis";
import eventBus, { CHAT_TITLE_GENERATE_EVENT } from "@/internal-lib/eventBus";
import { join } from "path";
import { getUserApiKeys, getProviderApiKey } from "@/internal-lib/utils/byok";
import { getChatClass } from "@/internal-lib/utils/getChatClass";
import { ApiError, ChatResponse } from "@/internal-lib/types/api";
import { doAiResponseInBackground, getAttachmentParts } from "@/internal-lib/utils/aiStreaming";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        } as ApiError, { status: 500 });
    }

    // Get user and API keys and check authorization
    const { requireByok, byok, user } = await getUserApiKeys();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    // Extract chat ID and prompt from request parameters
    const { id } = await params;
    const url = new URL(req.url);
    const fromIndex = parseInt(url.searchParams.get("fromIndex") || "-1", 10);
    const prompt = url.searchParams.get("prompt") || "";
    if (isNaN(fromIndex) || fromIndex < 1) {
        return NextResponse.json({ error: "Invalid fromIndex" } as ApiError, { status: 400 });
    }

    // Truncate messages up to fromIndex
    const messages = await redis.lrange(CHAT_MESSAGES_KEY(id), 0, -1);

    // Get chat info
    const rawChat = await redis.hget(USER_CHATS_KEY(user.id), id);
    let chatJson: ChatResponse | null;
    try {
        chatJson = rawChat ? {
            ...JSON.parse(rawChat),
            id: id,
        } : null;
    } catch { chatJson = null }
    if (!chatJson) return NextResponse.json({ error: "Failed to get chat" } as ApiError, { status: 404 });
    if (!chatJson.provider || !chatJson.model) {
        return NextResponse.json({ error: "Chat provider or model not set" } as ApiError, { status: 400 });
    }

    const prevMessages = messages.map(msgStr => {
        try { return JSON.parse(msgStr); } catch { return null; }
    }).filter(Boolean);

    // Find attachments from the last user message (if any)
    let lastUserMessageAttachments = undefined;
    for (let i = prevMessages.length - 1; i >= 0; i--) {
        if (prevMessages[i]?.role === "user" && prevMessages[i]?.attachments) {
            lastUserMessageAttachments = prevMessages[i].attachments;
            break;
        }
    }

    // BYOK enforcement
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

    // Save user message to Redis (only file paths in attachments, no file data in parts)
    const userMessage: Message = {
        role: "user",
        parts: [{ text: prompt }],
        attachments: lastUserMessageAttachments
    };

    // Prepare runtime message for AI: clone userMessage and inject loaded file data into parts
    const runtimeUserMessage: Message = {
        ...userMessage,
        parts: [...userMessage.parts],
    };

    // Load file data for each attachment and inject into parts
    const uploadsDir = join(process.cwd(), "public", "uploads");
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

    try {
        if (!chatJson.label) {
            const emitted = eventBus.emit(CHAT_TITLE_GENERATE_EVENT, id, [userMessage.parts[0].text]);
            if (!emitted) {
                console.log(`Emitting failed for chat ${id}.`);
            }
        }

        // Clean the redis stream to prevent duplication
        await redis.del(MESSAGE_STREAM_KEY(chatJson.id)).catch((err) => {
            console.error("Failed to trim message stream:", err);
        });
        
        setImmediate(() => {
            // Run AI response generation in the background
            doAiResponseInBackground(user.id, runtimeUserMessage, chatJson.id, chat);
        });

        return NextResponse.json({
            success: true,
            message: "AI response regeneration started",
            chatId: chatJson.id,
        }, { status: 200 });
    } catch (error) {
        console.error("Error during chat regeneration:", error);
        return NextResponse.json({ error: "Failed to regenerate content", details: (error as Error).message } as ApiError, { status: 500 });
    } finally {
        // Ensure generating state is cleared even if an error occurs
        await redis.del(CHAT_GENERATING_KEY(chatJson.id)).catch((err) => {
            console.error(err);
        });
    }
}
