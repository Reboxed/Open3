import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import redis, { MESSAGES_KEY, USER_CHATS_KEY } from "@/app/lib/redis";
import { Message } from "@/app/lib/types/ai";

// GET - Retrieve messages for a chat
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    try {
        // Get messages from Redis list
        const messageStrings = await redis.lrange(MESSAGES_KEY(id), 0, -1);
        const messages: Message[] = messageStrings.map(msgStr => {
            try {
                return JSON.parse(msgStr);
            } catch {
                return null;
            }
        }).filter(Boolean);

        return NextResponse.json({ messages }, { status: 200 });
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
        await redis.rpush(MESSAGES_KEY(id), JSON.stringify(message));

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
        await redis.del(MESSAGES_KEY(id));
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Failed to clear messages:', error);
        return NextResponse.json({ error: 'Failed to clear messages' }, { status: 500 });
    }
}
