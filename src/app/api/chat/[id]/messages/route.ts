import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import redis, { CHAT_MESSAGES_KEY, USER_CHATS_KEY } from "@/internal-lib/redis";
import { Message } from "@/app/lib/types/ai";
import { ApiError } from "@/internal-lib/types/api";

export interface ChatMessagesResponse {
    messages: Message[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (!user.userId) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    // Pagination parameters
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "25");
    const reverse = req.nextUrl.searchParams.get("reverse") === "true";
    if (page < 1) {
        return NextResponse.json({ error: "Page must be greater than 0" } as ApiError, { status: 400 });
    }
    if (limit < 1 || limit > 100) {
        return NextResponse.json({ error: "Limit must be between 1 and 100" } as ApiError, { status: 400 });
    }
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit - 1;

    const { id } = await params;
    const chatExists = await redis.hexists(USER_CHATS_KEY(user.userId), id);
    if (!chatExists) {
        return NextResponse.json({ error: "Chat not found" } as ApiError, { status: 404 });
    }

    try {
        const total = await redis.llen(CHAT_MESSAGES_KEY(id));
        let messageStrings: string[] = [];

        if (reverse) {
            // Reverse pagination: newest messages first
            // Calculate indices from the end
            const reverseStart = total - (page * limit);
            const reverseEnd = total - ((page - 1) * limit) - 1;
            // Clamp indices to valid range
            const start = Math.max(reverseStart, 0);
            const end = Math.max(reverseEnd, 0);

            // Redis lrange is inclusive, so ensure start <= end
            if (start <= end) {
                messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), start, end);
            } else {
                messageStrings = [];
            }
            // Since lrange returns oldest-to-newest, reverse to get newest-to-oldest
            messageStrings = messageStrings.reverse();
        } else {
            // Normal pagination: oldest messages first
            messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), startIndex, endIndex);
        }

        const messages: Message[] = messageStrings.map(msgStr => {
            try {
                return JSON.parse(msgStr);
            } catch {
                return null;
            }
        }).filter(Boolean);

        console.log(`Retrieved ${messages.length} messages for chat ${id} on page ${page} with limit ${limit}. Total messages: ${total} hasMore: ${total > endIndex + 1}`);
        return NextResponse.json({
            messages,
            total,
            page,
            limit,
            hasMore: total > endIndex + 1,
        } as ChatMessagesResponse, { status: 200 });
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
