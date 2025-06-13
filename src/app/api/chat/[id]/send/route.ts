import { Chat } from "@/app/lib/types/ai";
import { NextRequest, NextResponse } from "next/server";
import { chatsOfUsers } from "../../route";
import { currentUser } from "@clerk/nextjs/server";

export const AVAILABLE_PROVIDERS = ["google", "openai", "anthropic"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });

    const searchParams = req.nextUrl.searchParams;
    const prompt = searchParams.get('prompt');
    if (!prompt) {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const chat: Chat | undefined = chatsOfUsers.get(user.id)?.get(params.id);
    if (!chat) return NextResponse.json({ error: 'Failed to get chat' }, { status: 400 });

    try {
        const stream = await chat.sendStream({
            role: "user",
            parts: [{
                text: prompt
            }]
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
