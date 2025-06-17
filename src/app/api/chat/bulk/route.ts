import { currentUser } from "@clerk/nextjs/server";
import redis, { CHAT_MESSAGES_KEY, USER_CHATS_INDEX_KEY, USER_CHATS_KEY } from "../../../../internal-lib/redis";
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/internal-lib/types/api";

export async function DELETE(req: NextRequest) {
    try {
        const body = await req.json();
        const { chatIds } = body;

        if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
            return NextResponse.json({ error: "Invalid chat IDs provided" } as ApiError, { status: 400 });
        }

        // Validate that all chatIds are strings
        if (!chatIds.every(id => typeof id === "string")) {
            return NextResponse.json({ error: "All chat IDs must be strings" } as ApiError, { status: 400 });
        }

        const user = await currentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
        if (user.banned) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

        // Delete all chats in parallel
        const deletePromises = chatIds.map(async (chatId: string) => {
            try {
                await redis.multi()
                    .hdel(USER_CHATS_KEY(user.id), chatId)
                    .zrem(USER_CHATS_INDEX_KEY(user.id), chatId)
                    .del(CHAT_MESSAGES_KEY(chatId))
                    .exec();

                return { chatId, success: true };
            } catch (error) {
                console.error(`Failed to delete chat ${chatId}:`, error);
                return { chatId, success: false, error: error instanceof Error ? error.message : "Unknown error" };
            }
        });

        const results = await Promise.allSettled(deletePromises);
        const successful = results.filter(result =>
            result.status === "fulfilled" && result.value.success
        ).map(result => (result as PromiseFulfilledResult<{ chatId: string, success: boolean }>).value.chatId);

        const failed = results.filter(result =>
            result.status === "rejected" ||
            (result.status === "fulfilled" && !result.value.success)
        );

        if (failed.length > 0) {
            console.error("Some chats failed to delete:", failed);
        }

        return NextResponse.json({
            success: true,
            deleted: successful,
            failed: failed.length,
            total: chatIds.length,
        });

    } catch (error) {
        console.error("Bulk delete error:", error);
        return NextResponse.json({ error: "Internal server error" } as ApiError, { status: 500 });
    }
}
