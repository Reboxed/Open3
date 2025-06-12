import { Chat, GeminiChat } from "@/app/lib/types/ai";
import { GoogleGenAI } from "@google/genai";
import { NextApiRequest, NextApiResponse } from "next";
import { NextResponse } from "next/server";
import crypto from "crypto";

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEN_AI_API_KEY });

export const chats = new Map<string, Chat>();
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



export const AVAILABLE_PROVIDERS = ["google", "openai", "anthropic"];

export interface CreateChatRequest {
    label: string;
    model: string;
    provider: string; // Specify the provider
}

export interface CreateChatResponse {
    id: string;
    label: string;
    model: string;
    provider: string; // Specify the provider
}

export async function POST(req: NextApiRequest, res: NextApiResponse<CreateChatResponse>) {
    const { label, provider, model } = await req.body as CreateChatRequest;
    if (!label) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!model) {
        return NextResponse.json({ error: 'Model is required' }, { status: 400 });
    }
    if (!provider || !AVAILABLE_PROVIDERS.includes(provider)) {
        return NextResponse.json({ error: 'Provider is required and must be one of: ' + AVAILABLE_PROVIDERS.join(", ") }, { status: 400 });
    }

    const result = await createChat({ label, model, provider });
    return NextResponse.json(result, { status: 201 });
}

export async function createChat({ label, model, provider }: CreateChatRequest): Promise<CreateChatResponse> {
    const id = crypto.randomUUID();
    // TODO: Provider
    const chat = new GeminiChat([], "gemini-2.0-flash"); // TODO: make it use the model
    chat.model = model;
    chat.chatId = id;
    chats.set(id, chat);
    return {
        id,
        label,
        model,
        provider
    };
}
