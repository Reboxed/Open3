import { Chat, Message } from "@/app/lib/types/ai";
import { User } from "@clerk/nextjs/server";
import { CHAT_GENERATING_KEY, CHAT_MESSAGES_KEY, GET_LOOKUP_KEY, MESSAGE_STREAM_KEY, USER_FILES_KEY } from "../redis";
import { NextResponse } from "next/server";
import redis from "@/internal-lib/redis";
import { ApiError } from "../types/api";
import { join } from "path";
import { readFile } from "fs/promises";
import { deleteMessagesFromIndex } from "./messages";

// Helper to load file data for an attachment and return parts to inject
export async function getAttachmentParts({ userId, chatId, originalName, uploadsDir }: { userId: string, chatId: string, originalName: string, uploadsDir: string }) {
    const nulledLookupKey = GET_LOOKUP_KEY(userId, null, originalName);
    let randomName = await redis.get(nulledLookupKey);
    let foundWithNull = false;
    if (!randomName) {
        const chatLookupKey = GET_LOOKUP_KEY(userId, chatId, originalName);
        randomName = await redis.get(chatLookupKey);
        if (!randomName) return [];
    } else {
        foundWithNull = true;
    }
    // If "found with null", update lookup to chatId and delete null lookup
    if (foundWithNull) {
        const chatLookupKey = GET_LOOKUP_KEY(userId, chatId, originalName);
        await redis.set(chatLookupKey, randomName);
        await redis.del(nulledLookupKey);
        // Also update the file meta to set chat to chatId if it was null
        const file = await redis.hget(USER_FILES_KEY(userId), randomName);
        if (file) {
            let fileMeta;
            try { fileMeta = JSON.parse(file); } catch { fileMeta = null; }
            if (fileMeta && (fileMeta.chat === null || fileMeta.chat === undefined)) {
                await redis.hset(USER_FILES_KEY(userId), randomName, JSON.stringify({
                    ...fileMeta,
                    chat: chatId,
                }));
            }
        }
    }

    let fileMeta = null;
    const file = await redis.hget(USER_FILES_KEY(userId), randomName);
    if (file) {
        try { fileMeta = JSON.parse(file); } catch { }
    }

    try {
        const filePath = join(uploadsDir, randomName);
        const metaPath = filePath + ".meta.json";
        const fileBuffer = await readFile(filePath);
        let meta = fileMeta;
        try {
            const metaRaw = await readFile(metaPath, "utf8");
            meta = JSON.parse(metaRaw);
        } catch { }

        const ext = originalName.split(".").pop()?.toLowerCase() || "";
        const isImage = ["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(ext);
        if (isImage) {
            return [{
                inlineData: {
                    filename: originalName,
                    size: fileBuffer.length,
                    mimeType: meta?.mimeType || "application/octet-stream",
                    data: fileBuffer.toString("base64")
                }
            }];
        } else {
            let text = null;
            try {
                text = fileBuffer.toString("utf8");
                if (/^[\x00-\x08\x0E-\x1F\x7F-\x9F]/.test(text)) {
                    throw new Error("Binary content");
                }
            } catch {
                text = null;
            }
            const fileType = meta?.mimeType || "application/octet-stream";
            const fileSize = fileBuffer.length;
            const fileInfo = `[File: ${originalName} (${fileType}, ${(fileSize / 1024).toFixed(1)}KB)]`;
            if (text) {
                return [{
                    text: `${fileInfo}\nContent:\n${text}`
                }];
            } else {
                const metadata = {
                    type: fileType,
                    size: fileSize,
                    name: originalName
                };
                return [{
                    text: `${fileInfo}\nMetadata: ${JSON.stringify(metadata, null, 2)}`
                }];
            }
        }
    } catch (e) {
        console.error(`Failed to read file ${originalName}:`, e);
        return [{ text: `[Failed to process file: ${originalName}]` }];
    }
}

export async function doAiResponseInBackground(userId: string, message: Message, chatId: string, chat: Chat) {
    try {
        const stream = await chat.sendStream(message);

        const genResult = await redis.set(CHAT_GENERATING_KEY(chatId), "1", "EX", 60).catch((err) => {
            console.error(err);
            return null;
        });
        if (!genResult) {
            // Shouldn't happen unless a user is naughty and bypasses the GUI.
            return NextResponse.json({ error: "Failed to set generating state" } as ApiError, { status: 500 })
        }

        const reader = stream.getReader();
        // Collect the full response
        let fullResponse = "";

        const decoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            redis.set(CHAT_GENERATING_KEY(chatId), "1", "EX", 60).catch((err) => {
                console.error(err);
                return null;
            });

            // Parse the chunk to extract the text
            const chunkText = decoder.decode(value);
            if (chunkText.startsWith("data: ")) {
                try {
                    const text = chunkText.slice(6).replace(/\n\n$/, "");
                    fullResponse += text;

                    // This is probably how not to do it, buuuttttt
                    await redis.xadd(MESSAGE_STREAM_KEY(chatId), "*", "chunk", text).catch((err) => {
                        console.error(err);
                        return null;
                    });
                } catch (e) {
                    // Idk what would trigger this, but just in case
                    console.error("Failed to parse chunk text:", e);
                }
            }
        }

        // Save AI response to Redis
        if (fullResponse) {
            const aiMessage: Message = {
                role: "model",
                parts: [{ text: fullResponse }]
            };
            await redis.rpush(CHAT_MESSAGES_KEY(chatId), JSON.stringify(aiMessage));
        }

        await redis.xadd(MESSAGE_STREAM_KEY(chatId), "*", "done", "DONE").catch((err) => {
            console.error("Failed to send done message to stream:", err);
            return null;
        });

        reader.releaseLock();
    } catch (error) {
        // delete the last message of chat message keys if it was an error
        await deleteMessagesFromIndex({
            fromIndex: -1, // -1 to delete the last message
            redis,
            chatId,
            userId,
        }).catch((err) => {
            console.error("Failed to delete last message on error:", err);
            return [];
        });
        console.error("Error during AI response generation:", error);
        // Send SSE error event to client before closing
        await redis.xadd(MESSAGE_STREAM_KEY(chatId), "*", "error", (error as Error).message).catch((err) => {
            console.error("Failed to send error message to stream:", err);
        });
    } finally {
        // Delete the generating state
        await redis.del(CHAT_GENERATING_KEY(chatId)).catch((err) => {
            // This shouldn't hopefully happen or else i will shoot myself
            console.error(err);
        });

        // Clean the redis stream to prevent duplicates
        await redis.xtrim(MESSAGE_STREAM_KEY(chatId), "MAXLEN", 0).catch((err) => {
            console.error("Failed to trim message stream:", err);
        });
    }
}
