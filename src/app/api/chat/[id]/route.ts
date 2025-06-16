import { Message } from "@/app/lib/types/ai";
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import redis, { USER_CHATS_KEY, USER_CHATS_INDEX_KEY, CHAT_MESSAGES_KEY } from "@/app/lib/redis";
import { GetChat } from "../route";

interface ChatResponse {
    id: string;
    label: string;
    model: string;
    provider: string;
    history: Message[];
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!user.userId) return NextResponse.json({ exists: [] }, { status: 401 });

    const { id } = await params;
    const rawChat = await redis.hget(USER_CHATS_KEY(user.userId), id);
    let chat: GetChat | null;
    try {
        chat = rawChat ? {
            ...JSON.parse(rawChat),
            id: id,
        } : null;
    } catch {
        chat = null;
    }
    if (!chat) return NextResponse.json({ error: 'Failed to get chat' }, { status: 404 });

    return NextResponse.json({
        id: chat.id,
        label: chat.label,
        model: chat.model,
        provider: chat.provider,
    } as ChatResponse, { status: 200 });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 })
    }

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    
    // Use a transaction to delete both chat data and messages
    const result = await redis.multi()
        .hdel(USER_CHATS_KEY(user.id), id)
        .zrem(USER_CHATS_INDEX_KEY(user.id), id)
        .del(CHAT_MESSAGES_KEY(id))
        .exec();
    
    // Check if chat deletion was successful (first operation)
    if (!result || result[0][1] === 0) {
        return NextResponse.json({ error: "Failed to delete chat" }, { status: 404 });
    }

    return NextResponse.json({
        success: "Chat deleted",
    }, { status: 200 });
}

