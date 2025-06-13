import { Message } from "@/app/lib/types/ai";
import { chatsOfUsers } from "../route";
import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

interface ChatResponse {
    id: string;
    label: string;
    model: string;
    provider: string;
    history: Message[];
}

export async function GET({ params }: { params: { id: string } }) {
    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });

    const chat = chatsOfUsers.get(user.id)?.get(params.id);
    if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({
        id: chat.id,
        label: chat.model, // Assuming label is the model name for simplicity
        model: chat.model,
        provider: "google", // Assuming Google as the provider for this example
        history: chat.getHistory()
    } as ChatResponse, { status: 200 });
}
