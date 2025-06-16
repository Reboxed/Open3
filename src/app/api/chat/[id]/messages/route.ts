import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import redis, { CHAT_GENERATING_KEY, CHAT_MESSAGES_KEY, USER_CHATS_KEY } from "@/app/lib/redis";
import { Message } from "@/app/lib/types/ai";

// GET - Retrieve messages for a chat
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!user.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    // Verify user owns this chat
    const chatExists = await redis.hexists(USER_CHATS_KEY(user.userId), id);
    if (!chatExists) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const isGenerating = await redis.get(CHAT_GENERATING_KEY(id));

    // Pagination: get offset/limit from query params
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "25", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    try {
        // Get total count
        const total = await redis.llen(CHAT_MESSAGES_KEY(id));
        // Redis lrange is inclusive, so end = offset+limit-1
        const start = Math.max(0, total - offset - limit);
        const end = total - offset - 1;
        let messageStrings: string[] = [];
        if (total > 0 && end >= 0 && start <= end) {
            messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), start, end);
        }
        const messages: Message[] = messageStrings.map(msgStr => {
            try {
                return JSON.parse(msgStr);
            } catch {
                return null;
            }
        }).filter(Boolean);

        return NextResponse.json({
            messages,
            generating: !!isGenerating,
            total,
            offset,
            limit
        }, { status: 200 });
    } catch (error) {
        console.error('Failed to retrieve messages:', error);
        return NextResponse.json({ error: 'Failed to retrieve messages' }, { status: 500 });
    }
}

// POST - Add a new message to a chat
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    
    // Verify user owns this chat
    const chatExists = await redis.hexists(USER_CHATS_KEY(user.id), id);
    if (!chatExists) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    try {
        const { message } = await req.json() as { message: Message };
        
        if (!message || !message.role || !message.parts || !Array.isArray(message.parts)) {
            return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
        }

        // Add message to Redis list
        await redis.rpush(CHAT_MESSAGES_KEY(id), JSON.stringify(message));

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        console.error('Failed to save message:', error);
        return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
    }
}

// DELETE - Clear all messages for a chat (optional, for cleanup)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    
    // Verify user owns this chat
    const chatExists = await redis.hexists(USER_CHATS_KEY(user.id), id);
    if (!chatExists) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    try {
        // Clear all messages for this chat
        await redis.del(CHAT_MESSAGES_KEY(id));
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Failed to clear messages:', error);
        return NextResponse.json({ error: 'Failed to clear messages' }, { status: 500 });
    }
}
