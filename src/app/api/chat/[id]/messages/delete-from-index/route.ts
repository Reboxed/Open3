import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import redis, { USER_CHATS_KEY } from "@/internal-lib/redis";
import { ApiError } from "@/internal-lib/types/api";
import { deleteMessagesFromIndex } from "@/internal-lib/utils/messages";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }
    
    const user = await auth();
    if (!user || !user.userId) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    const { id } = await params;
    const url = new URL(req.url);
    const fromIndex = parseInt(url.searchParams.get("fromIndex") || "-1", 10);
    if (isNaN(fromIndex) || fromIndex < 0) {
        return NextResponse.json({ error: "Invalid fromIndex" } as ApiError, { status: 400 });
    }
    
    const chatExists = await redis.hexists(USER_CHATS_KEY(user.userId), id);
    if (!chatExists) {
        return NextResponse.json({ error: "Chat not found" } as ApiError, { status: 404 });
    }

    const keepMessages = await deleteMessagesFromIndex({
        fromIndex,
        redis,
        chatId: id,
        userId: user.userId,
    });

    return NextResponse.json({ success: true, messages: keepMessages }, { status: 200 });
}
