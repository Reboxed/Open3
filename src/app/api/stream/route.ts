import { createRedisConnection, MESSAGE_STREAM_KEY } from "@/internal-lib/redis";
import { ApiError } from "@/internal-lib/types/api";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    // This endpoint is responsible for introducing robust streaming capabilities to the app, even across clients.
    // The way it will work is by using a shared redis stream that all clients of a user will listen to.
    // TODO: If the user disconnects, the stream will be closed and a new one will be created, but all previous messages
    // TODO: should be resent on reconnect.
    let shouldRun = true;

    const chatId = req.nextUrl.searchParams.get("chat");
    if (!chatId) {
        return NextResponse.json({ error: "Chat ID is required" } as ApiError, { status: 400 });
    }

    const sub = createRedisConnection();
    try {
        const ready = new Promise<void>((resolve, reject) => {
            sub.on("ready", () => {
                console.log("Redis subscription ready");
                resolve();
            });
            sub.on("error", (err) => {
                console.error("Redis subscription error:", err);
                reject("Redis subscription error");
            });
        });
        await ready;

        req.signal.addEventListener("abort", () => {
            console.log("Stream aborted");
            shouldRun = false;
            // Clean up the subscription
            sub.quit();
        }, { once: true });

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                let lastId = "0"; // "0" to start reading from the beginning of the stream

                try {
                    while (shouldRun) {
                        const res = await sub.xread(
                            "BLOCK", 5000, // 5 seconds max wait to check shouldRun periodically
                            "STREAMS", MESSAGE_STREAM_KEY(chatId), lastId
                        );

                        if (!res) continue; // Timeout, no message yet

                        const [_, messages] = res[0];
                        if (!messages || messages.length === 0) continue; // No new messages

                        for (const [_, fields] of messages) {
                            const key = fields[0]; // The first field is the key
                            if (!key) continue; // Skip if no key

                            if (key === "done") {
                                controller.enqueue(encoder.encode("event: done\ndata: \n\n"));
                                continue;
                            }
                            if (key === "error") {
                                controller.enqueue(encoder.encode(`event: error\ndata: \n\n`));
                                continue;
                            }

                            // Each massage has a chunk key and a value which is just plain text
                            const message = fields[1];
                            if (!message) continue;
                            controller.enqueue(encoder.encode(`data: ${message}\n\n`));
                        }

                        lastId = messages[messages.length - 1][0]; // Update lastId to the last message ID
                    }

                    controller.close();
                    if (sub.status == "ready") sub.quit();
                } catch (err) {
                    console.error("Error in XREAD loop:", err);
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