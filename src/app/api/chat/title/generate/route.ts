import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { GetChat } from "../../route";
import redis, { CHAT_MESSAGES_KEY, USER_CHATS_KEY } from "@/app/lib/redis";
import { Message } from "@/app/lib/types/ai";
import eventBus, { CHAT_TITLE_GENERATE_EVENT } from "@/app/lib/eventBus";
import { GoogleGenAI, PartUnion } from "@google/genai";
import { TITLE_PROMPT } from "@/constants";

export async function GET(req: NextRequest) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: "Chat ID is required" }, { status: 400 });
    }
    // Make sure it's a valid UUID format
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
        return NextResponse.json({ error: "Invalid chat ID format" }, { status: 400 });
    }

    const rawChat = await redis.hget(USER_CHATS_KEY(user.id), id);
    let chat: GetChat | null = null;
    try {
        chat = rawChat ? {
            ...JSON.parse(rawChat),
            id: id,
        } : null;
    } catch { }
    if (!chat) return NextResponse.json({ error: "Failed to get chat" }, { status: 404 });
    if (chat.label) return NextResponse.json({ error: "Chat already has a title" }, { status: 400 });

    // load first msg
    const messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), 0, 2);
    const messages: string[] = [];
    for (const messageString of messageStrings) {
        try {
            const msg: Message = JSON.parse(messageString ?? "");
            if (msg && msg.parts && msg.parts.length > 0) {
                messages.push(msg.parts[0].text);
            }
        } catch { }
    }
    if (messages.length === 0) {
        return NextResponse.json({ error: "No messages found" }, { status: 400 });
    }

    const emitted = eventBus.emit(CHAT_TITLE_GENERATE_EVENT, id, messages);
    if (!emitted) {
        console.log(`Emitting failed for chat ${id}, generating title directly instead.`);
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEN_AI_API_KEY });
        const result = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            config: {
                systemInstruction: TITLE_PROMPT,
            },
            contents: messages.map(msg => ({ role: "user", text: msg } as PartUnion)),
        }).catch(err => {
            console.error("Failed to generate title:", err);
            return null;
        });
        if (!result || !result.text) {
            return NextResponse.json({ error: "Failed to generate title" }, { status: 500 });
        }
        const title = result.text.trim();
        if (!title) {
            return NextResponse.json({ error: "Generated title is empty" }, { status: 500 });
        }
        await redis.hset(USER_CHATS_KEY(user.id), id, JSON.stringify({
            ...chat,
            label: title,
        } as GetChat));

        console.log(`Generated title for chat ${id}: ${title}`);
        return NextResponse.json({ success: "Generated title", title: title }, { status: 200 });
    }

    return NextResponse.json({
        success: "Title generation started",
        chatId: id,
    }, { status: 200 });
}
