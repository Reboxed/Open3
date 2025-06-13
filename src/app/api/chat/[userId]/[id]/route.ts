import { Chat, Message } from "@/app/lib/types/ai";
import { chatsOfUsers } from "../route";
import { NextResponse } from "next/server";

export async function GET({ params }: { params: { userId: string; id: string } }) {
    const chat = chatsOfUsers.get(params.userId)?.get(params.id);
    if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({
        id: chat.id,
        label: chat.model, // Assuming label is the model name for simplicity
        model: chat.model,
        provider: "google", // Assuming Google as the provider for this example
        history: chat.getHistory()
    } as {
        id: string;
        label: string;
        model: string;
        provider: string;
        history: Message[];
    }, { status: 200 });
}
