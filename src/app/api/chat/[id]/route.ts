import { Message } from "@/app/lib/types/ai";
import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import redis, { USER_CHATS_KEY, USER_CHATS_INDEX_KEY, CHAT_MESSAGES_KEY, USER_FILES_KEY, MESSAGE_STREAM_KEY, USER_PINNED_CHATS_KEY } from "@/internal-lib/redis";
import { join } from "path";
import { unlink } from "fs/promises";
import { ApiError } from "@/internal-lib/types/api";

// TODO: Move this into constants.ts, didnt feel like it
interface ChatResponse {
    id: string;
    label: string;
    pinned?: boolean;
    model: string;
    provider: string;
    history: Message[];
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (!user.userId) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    const { id } = await params;
    const rawChat = await redis.hget(USER_CHATS_KEY(user.userId), id);
    let chat: ChatResponse | null;
    try {
        chat = rawChat ? {
            ...JSON.parse(rawChat),
            id: id,
        } : null;
    } catch {
        chat = null;
    }
    if (!chat) return NextResponse.json({ error: "Failed to get chat" } as ApiError, { status: 404 });

    return NextResponse.json({
        id: chat.id,
        label: chat.label,
        model: chat.model,
        provider: chat.provider,
    } as ChatResponse, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 200 });
    }

    try {
        const updateBody = await req.json() as {
            label?: string;
            pinned?: boolean;
        };

        // Check if no fields are provided in the body
        if (updateBody.label === undefined && updateBody.pinned === undefined) { // It's just label atm, model/provider can't be changed via updating the chat only by sending
            return NextResponse.json({ error: "At least one field is required (label, pinned)" } as ApiError, { status: 400 });
        }

        const user = await currentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 200 });
        if (user.banned) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 200 });

        const { id } = await params;

        const rawChat = await redis.hget(USER_CHATS_KEY(user.id), id);
        if (!rawChat) return NextResponse.json({ error: "Chat not found" } as ApiError, { status: 200 });
        const chat = JSON.parse(rawChat);

        // If label is provided, update label
        if (updateBody.label !== undefined && updateBody.label.trim() !== "") {
            if (updateBody.label.trim().length > 100) {
                return NextResponse.json({ error: "Label is too long, maximum length is 100 characters" } as ApiError, { status: 400 });
            }
            chat.label = updateBody.label.trim();
        }
        // If pinned is provided, update pinned
        if (updateBody.pinned !== undefined) {
            if (updateBody.pinned) {
                await redis.zadd(USER_PINNED_CHATS_KEY(user.id), Date.now(), id);
            } else {
                await redis.zrem(USER_PINNED_CHATS_KEY(user.id), id);
            }
            chat.pinned = updateBody.pinned;
        }

        // Update the chat
        await redis.hset(USER_CHATS_KEY(user.id), id, JSON.stringify(chat));
        return NextResponse.json({ success: "Updated chat successfully" }, { status: 200 });
    } catch (error) {
        console.error("Unknown error occurred while updating a chat: ", (error as Error).message);
        return NextResponse.json({ error: "An unknown error occurred" }, { status: 500 });
    }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }

    try {
        const user = await currentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
        if (user.banned) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

        const { id } = await params;

        // Delete all files belonging to this chat
        const USER_FILES_KEY_CONST = USER_FILES_KEY(user.id);
        const files = await redis.hgetall(USER_FILES_KEY_CONST);
        const uploadsDir = join(process.cwd(), "public", "uploads");
        for (const [randomName, fileMetaRaw] of Object.entries(files)) {
            try {
                const fileMeta = JSON.parse(fileMetaRaw);
                if (fileMeta.chat === id) {
                    // Remove file and meta from disk
                    const filePath = join(uploadsDir, randomName);
                    await unlink(filePath).catch(() => { });
                    await unlink(filePath + ".meta.json").catch(() => { });
                    // Remove from redis
                    await redis.hdel(USER_FILES_KEY_CONST, randomName);
                }
            } catch (error) {
                console.error(`Failed to delete file ${randomName} for chat ${id}:`, error);
            }
        }

        // Use a transaction to delete both chat data and messages
        const result = await redis.multi()
            .hdel(USER_CHATS_KEY(user.id), id)
            .del(CHAT_MESSAGES_KEY(id))
            .zrem(USER_CHATS_INDEX_KEY(user.id), id)
            .exec();

        // Clean the redis stream to prevent duplicates
        await redis.del(MESSAGE_STREAM_KEY(id)).catch((err) => {
            console.error("Failed to trim message stream:", err);
        });

        // Check if chat deletion was successful (first operation)
        if (!result || result[0][1] === 0) {
            return NextResponse.json({ error: "Failed to delete chat" } as ApiError, { status: 404 });
        }

        return NextResponse.json({ success: "Chat deleted" }, { status: 200 });
    } catch (error) {
        console.error("Error deleting chat:", error);
        return NextResponse.json({ error: "Failed to delete chat" } as ApiError, { status: 500 });
    }
}

