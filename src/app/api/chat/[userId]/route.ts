import { NextApiRequest, NextApiResponse } from "next";
import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_PROVIDERS } from "./[id]/send/route";
import { Chat, GeminiChat } from "@/app/lib/types/ai";
import { ApiError } from "../../tab/route";

export const chatsOfUsers = new Map<string, Map<string, Chat>>();

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

export interface GetChatsResponse {
    chats: Chat[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

export async function GET(req: NextRequest, res: NextApiResponse<GetChatsResponse | ApiError>, { params }: { params: { userId: string } }) {
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    
    if (page < 1) {
        return res.status(400).json({ error: 'Page must be greater than 0' });
    }
    if (limit < 1 || limit > 100) {
        return res.status(400).json({ error: 'Limit must be between 1 and 100' });
    }

    const userChats = chatsOfUsers.get(params.userId) || new Map<string, Chat>();
    const chatsArray = Array.from(userChats.values());
    
    const total = chatsArray.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedChats = chatsArray.slice(startIndex, endIndex);
    
    return res.status(200).json({
        chats: paginatedChats,
        total,
        page,
        limit,
        hasMore: endIndex < total
    });
}

export async function POST(req: NextApiRequest, res: NextApiResponse<CreateChatResponse | ApiError>, { params }: { params: { userId: string } }) {
    const { label, provider, model } = await req.body as CreateChatRequest;
    if (!label) {
        return res.status(400).json({ error: 'Label is required' });
    }
    if (!model) {
        return res.status(400).json({ error: 'Model is required' });
    }
    if (!provider || !AVAILABLE_PROVIDERS.includes(provider)) {
        return res.status(400).json({ error: 'Provider is required and must be one of: ' + AVAILABLE_PROVIDERS.join(", ") });
    }

    const result = await createChat(params.userId, { label, model, provider });
    return res.status(201).json(result);
}

export async function createChat(userId: string, { label, model, provider }: CreateChatRequest): Promise<CreateChatResponse> {
    const id = crypto.randomUUID();
    // TODO: Provider
    const chat = new GeminiChat([], model ?? "gemini-2.0-flash"); // TODO: make it use the model
    chat.id = id;
    chat.provider = provider;
    chat.label = label;
    
    const chats = chatsOfUsers.get(userId) || new Map<string, Chat>();
    chats.set(id, chat);
    chatsOfUsers.set(userId, chats);
    
    return {
        id,
        label,
        model,
        provider
    };
}