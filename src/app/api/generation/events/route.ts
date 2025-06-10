import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: "AIzaSyAMMHqf1uySG5ChWzy_LLCNBFUWMUz3pUM" })

export async function GET(req: NextRequest) {
    const message = req.nextUrl.searchParams.get("message");
    if (!message) {
        // Create a new ReadableStream to send SSE chunks
        const stream = new ReadableStream({
            async start(controller) {
                // Format chunk as SSE event
                const data = `data: {"error": true, "message": "message parameter missing"}\n\n`;
                // Encode and enqueue the chunk
                controller.enqueue(new TextEncoder().encode(data));
                controller.close();
            },
        });

        return new NextResponse(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            },
        });
    }

    // Create a new ReadableStream to send SSE chunks
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const response = await ai.models.generateContentStream({
                    model: "gemini-2.0-flash",
                    contents: message,
                    config: {
                        systemInstruction:
                            "You're an assistant in a chat application titled `Open3`. Your model is Gemini 2.0 Flash. Don't mention your AI model unless specifically asked. Respond in markdown for styling unless otherwise specified by the user.",
                    },
                });

                // Assume response is an async iterable of chunks
                for await (const chunk of response) {
                    // Format chunk as SSE event
                    const data = `data: ${JSON.stringify(chunk)}\n\n`;

                    // Encode and enqueue the chunk
                    controller.enqueue(new TextEncoder().encode(data));
                }
                // Close stream when done
                controller.close();
            } catch (error) {
                // Send error as SSE event
                const errData = `data: {"error": true, "message": "${error.message || error}"}\n\n`;
                controller.enqueue(new TextEncoder().encode(errData));
                controller.close();
            }
        },
    });

    return new NextResponse(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}

