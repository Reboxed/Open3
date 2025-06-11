import { Chat, GeminiChat } from "@/app/lib/types/ai";
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEN_AI_API_KEY });

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

const chats = new Map<string, Chat>();
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const prompt = searchParams.get('prompt');
    if (!prompt) {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    const id = searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    let chat: Chat | undefined;
    if (!chats.has(id)) {
        chat = new GeminiChat([], "gemini-2.0-flash")
        chats.set(id, chat);
    } else chat = chats.get(id)
    if (!chat) return NextResponse.json({ error: 'Failed to get chat' }, { status: 400 });

    try {
        const stream = await chat.sendStream({
            role: "user",
            parts: [{
                text: prompt
            }]
        })

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
