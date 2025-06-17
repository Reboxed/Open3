import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import redis, { CHAT_MESSAGES_KEY, USER_CHATS_KEY, GET_LOOKUP_KEY } from "@/app/lib/redis";
import { Message } from "@/app/lib/types/ai";
import { join } from "path";
import { unlink, stat } from "fs/promises";

const uploadsDir = join(process.cwd(), "public", "uploads");

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" }, { status: 500 });
    }
    const user = await auth();
    if (!user || !user.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const url = new URL(req.url);
    const fromIndex = parseInt(url.searchParams.get("fromIndex") || "-1", 10);
    if (isNaN(fromIndex) || fromIndex < 0) {
        return NextResponse.json({ error: "Invalid fromIndex" }, { status: 400 });
    }
    
    const chatExists = await redis.hexists(USER_CHATS_KEY(user.userId), id);
    if (!chatExists) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    
    let messageStrings: string[] = [];
    messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(id), 0, -1);
    const messages: Message[] = messageStrings.map(msgStr => {
        try { return JSON.parse(msgStr); } catch { return null; }
    }).filter(Boolean);
    
    const keepMessages = messages.slice(0, fromIndex);
    const toDelete = messages.slice(fromIndex);
    
    for (const msg of toDelete) {
        if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
                try {
                    const lookupKey = GET_LOOKUP_KEY(user.userId, id, att.filename);
                    const fileKey = await redis.get(lookupKey);
                    if (fileKey) {
                        const filePath = join(uploadsDir, fileKey);
                        try { await stat(filePath); await unlink(filePath); } catch {}
                        try { await stat(filePath + ".meta.json"); await unlink(filePath + ".meta.json"); } catch {}
                        await redis.del(lookupKey);
                    }
                } catch {}
            }
        }
    }
    
    await redis.del(CHAT_MESSAGES_KEY(id));
    if (keepMessages.length > 0) {
        await redis.rpush(CHAT_MESSAGES_KEY(id), ...keepMessages.map(m => JSON.stringify(m)));
    }
    return NextResponse.json({ success: true, messages: keepMessages }, { status: 200 });
}
