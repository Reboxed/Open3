import { GeminiChat } from "@/app/lib/types/ai";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { USER_CHATS_KEY } from "@/app/lib/redis";
import { GetChat } from "../../route";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });

    const searchParams = req.nextUrl.searchParams;
    const prompt = searchParams.get('prompt');
    if (!prompt) {
        return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const { id } = await params;
    const rawChat = await redis.hget(USER_CHATS_KEY(user.id), id);
    let chatJson: GetChat | null;
    try {
        chatJson = rawChat ? {
            ...JSON.parse(rawChat),
            id: id,
        } : null;
    } catch {
        chatJson = null;
    }
    if (!chatJson) return NextResponse.json({ error: 'Failed to get chat' }, { status: 404 });

    console.log(id, "CHAT ID")
    const chat = new GeminiChat([], chatJson.model);

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
        return NextResponse.json({ error: 'Failed to generate content', details: (error as Error).message }, { status: 500 });
    }
}
