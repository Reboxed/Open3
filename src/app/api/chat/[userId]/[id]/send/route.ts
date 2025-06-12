import { Chat } from "@/app/lib/types/ai";
import { NextRequest, NextResponse } from "next/server";
import { chatsOfUsers } from "../../route";

export const AVAILABLE_PROVIDERS = ["google", "openai", "anthropic"];

export async function GET(req: NextRequest, { params }: { params: { userId: string; id: string } }) {
    const searchParams = req.nextUrl.searchParams;
    const prompt = searchParams.get('prompt');
    if (!prompt) {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const chat: Chat | undefined = chatsOfUsers.get(params.userId)?.get(params.id);
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
