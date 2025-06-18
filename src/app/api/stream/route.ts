import redis, { createRedisConnection, MESSAGE_STREAM_KEY, USER_CHATS_KEY } from "@/internal-lib/redis";
import { ApiError, ChatResponse } from "@/internal-lib/types/api";
import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    // This endpoint is responsible for introducing robust streaming capabilities to the app, even across clients.
    // The way it will work is by using a shared redis stream that all clients of a user will listen to.
    // If the user disconnects, the stream will be closed and a new one will be created, but all previous messages
    // should be resent on reconnect.
    let shouldRun = true;

    const chatId = req.nextUrl.searchParams.get("chat");
    if (!chatId) {
        return NextResponse.json({ error: "Chat ID is required" } as ApiError, { status: 400 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    const rawChat = await redis.hget(USER_CHATS_KEY(user.id), chatId);
    if (!rawChat) return NextResponse.json({ error: "Failed to get chat" } as ApiError, { status: 404 });

    const sub = createRedisConnection();
    try {
        const ready = new Promise<void>((resolve, reject) => {
            sub.on("ready", () => {
                console.log("Redis subscription ready");
                shouldRun = true;
                resolve();
            });
            sub.on("error", (err) => {
                console.error("Redis subscription error:", err);
                shouldRun = false;
                reject("Redis subscription error");
            });
        });
        await ready;

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let lastId = "0"; // "0" to start reading from the beginning of the stream

                try {
                    const streamKey = MESSAGE_STREAM_KEY(chatId);
                    while (shouldRun) {
                        const res = await sub.xread(
                            "BLOCK", 10000, // 10 seconds max wait to check shouldRun periodically
                            "STREAMS", streamKey, lastId
                        ).catch((err) => {
                            console.error("Error reading from Redis stream:", err);
                            return null; // Handle error gracefully
                        });

                        if (!res) continue; // Timeout, no message yet

                        const [_, messages] = res[0];
                        if (!messages || messages.length === 0) continue; // No new messages

                        let shouldDeleteStream = false;

                        for (const [_, fields] of messages) {
                            const key = fields[0]; // The first field is the key
                            if (!key) continue; // Skip if no key
                            
                            if (key === "done") {
                                controller.enqueue(encoder.encode("event: stream-done\ndata: DONE\n\n"));
                                shouldDeleteStream = true;
                                continue;
                            }
                            if (key === "error") {
                                controller.enqueue(encoder.encode(`event: stream-error\ndata: ${fields[1]}\n\n`));
                                shouldDeleteStream = true;
                                continue;
                            }
                            
                            // Each message has a chunk key and a value which is just plain text
                            const message = fields[1];
                            if (!message) continue;
                            // console.log("Received message: " + message.replace(/\n/g, "\\n"));
                            controller.enqueue(encoder.encode(`data: ${message.replace(/\n/g, "\\n")}\n\n`));
                        }

                        lastId = messages[messages.length - 1][0]; // Update lastId to the last message ID
                        if (shouldDeleteStream) {
                            await sub.xtrim(streamKey, "MAXLEN", 0);
                        }
                    }

                    controller.close();
                    if (sub.status == "ready") sub.quit();
                } catch (err) {
                    console.warn("Error in XREAD loop:", (err as Error).message);
                    // We do not close the controller here, as we want to keep the stream open for future messages
                }
            }
        });

        return new NextResponse(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
            },
        });
    } catch (e) {
        // Clean up the subscription on error
        sub.quit();
        shouldRun = false;

        console.error("Failed to initialize Redis subscription:", e);
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }
}