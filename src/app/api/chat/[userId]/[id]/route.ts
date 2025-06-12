import { Chat, Message } from "@/app/lib/types/ai";
import { NextApiRequest, NextApiResponse } from "next";
import { chatsOfUsers } from "../route";
import { ApiError } from "../../../tab/route";

export async function GET(req: NextApiRequest, res: NextApiResponse<{
    id: string;
    label: string;
    model: string;
    provider: string;
    history: Message[];
} | ApiError>, { params }: { params: { userId: string; id: string } }) {
    const chat = chatsOfUsers.get(params.userId)?.get(params.id);
    if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
    }
    
    return res.status(200).json({
        id: chat.id,
        label: chat.model, // Assuming label is the model name for simplicity
        model: chat.model,
        provider: "google", // Assuming Google as the provider for this example
        history: chat.getHistory()
    });
}
