import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEN_AI_API_KEY });

// Create a new ReadableStream to send SSE chunks
/*const stream = new ReadableStream({
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
});*/

export async function POST(req: Request) {
    const { prompt } = await req.json();

    try {
        const result = await genAI.models.generateContentStream({
            model: "gemini-2.0-flash",
            contents: prompt
        });
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of result) {
                        const text = chunk.text;
                        controller.enqueue(new TextEncoder().encode(`data: ${text}\n\n`));
                    }
                    controller.close();
                } catch(error) {
                    controller.error(error);
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        return NextResponse.json({error: 'Failed to generate content', details: (error as Error).message}, { status: 500 });
    }
}