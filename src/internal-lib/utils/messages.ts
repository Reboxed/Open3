import { Message } from "@/app/lib/types/ai";
import { CHAT_MESSAGES_KEY, GET_LOOKUP_KEY } from "@/internal-lib/redis";
import { stat, unlink } from "fs/promises";
import Redis from "ioredis";
import { join } from "path";

const uploadsDir = join(process.cwd(), "public", "uploads");

/**
 * Deletes messages from a chat starting from fromIndex, including attachments.
 * Returns the kept messages.
 */
export async function deleteMessagesFromIndex({
    fromIndex,
    redis,
    chatId,
    userId,
}: {
    fromIndex: number;
    redis: Redis;
    chatId: string;
    userId: string;
}) {
    let messageStrings: string[] = [];
    messageStrings = await redis.lrange(CHAT_MESSAGES_KEY(chatId), 0, -1);
    const messages: Message[] = messageStrings.map(msgStr => {
        try { return JSON.parse(msgStr); } catch { return null; }
    }).filter(Boolean);

    const keepMessages = messages.slice(0, fromIndex);
    const toDelete = messages.slice(fromIndex);

    for (const msg of toDelete) {
        if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
                try {
                    const lookupKey = GET_LOOKUP_KEY(userId, chatId, att.filename);
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

    await redis.del(CHAT_MESSAGES_KEY(chatId));
    if (keepMessages.length > 0) {
        await redis.rpush(CHAT_MESSAGES_KEY(chatId), ...keepMessages.map(m => JSON.stringify(m)));
    }
    return keepMessages;
}