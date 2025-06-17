import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import redis, { CHAT_GENERATING_KEY, CHAT_MESSAGES_KEY, USER_CHATS_KEY } from "@/internal-lib/redis";
import { Message } from "@/app/lib/types/ai";
import { ApiError } from "@/internal-lib/types/api";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (!user.userId) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    const { id } = await params;
    const chatExists = await redis.hexists(USER_CHATS_KEY(user.userId), id);
    if (!chatExists) {
        return NextResponse.json({ error: "Chat not found" } as ApiError, { status: 404 });
    }

    const isGenerating = await redis.get(CHAT_GENERATING_KEY(id));

    try {
        let messageStrings: string[] = [];
        messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), 0, -1);

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
        }, { status: 200 });
    } catch (error) {
        console.error("Failed to retrieve messages:", error);
        return NextResponse.json({ error: "Failed to retrieve messages" } as ApiError, { status: 500 });
    }
}

// DELETE - Clear all messages for a chat (optional, for cleanup)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    const { id } = await params;

    const chatExists = await redis.hexists(USER_CHATS_KEY(user.id), id);
    if (!chatExists) {
        return NextResponse.json({ error: "Chat not found" } as ApiError, { status: 404 });
    }

    try {
        await redis.del(CHAT_MESSAGES_KEY(id));
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Failed to clear messages:", error);
        return NextResponse.json({ error: "Failed to clear messages" } as ApiError, { status: 500 });
    }
}
