import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_PROVIDERS } from "./[id]/send/route";
import { Chat, GeminiChat } from "@/app/lib/types/ai";
import { currentUser } from "@clerk/nextjs/server";

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

export async function GET(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });

    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    
    if (page < 1) {
        return NextResponse.json({ error: 'Page must be greater than 0' }, { status: 400 });
    }
    if (limit < 1 || limit > 100) {
        return NextResponse.json({ error: 'Limit must be between 1 and 100' }, { status: 400 });
    }

    const userChats = chatsOfUsers.get(user.id) || new Map<string, Chat>();
    const chatsArray = Array.from(userChats.values());
    
    const total = chatsArray.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedChats = chatsArray.slice(startIndex, endIndex);
    
    return NextResponse.json({
        chats: paginatedChats,
        total,
        page,
        limit,
        hasMore: endIndex < total
    } as GetChatsResponse, { status: 200 });
}

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });

    const { label, provider, model } = await req.json() as CreateChatRequest;
    if (!label) {
        return NextResponse.json({ error: 'Label is required' }, { status: 400 });
    }
    if (!model) {
        return NextResponse.json({ error: 'Model is required' }, { status: 400 });
    }
    if (!provider || !AVAILABLE_PROVIDERS.includes(provider)) {
        return NextResponse.json({ error: 'Provider is required and must be one of: ' + AVAILABLE_PROVIDERS.join(", ") }, { status: 400 });
    }

    const result = await createChat(user.id, { label, model, provider });
    return NextResponse.json(result as CreateChatResponse, { status: 201 });
}

export async function createChat(userId: string, { label, model, provider }: CreateChatRequest): Promise<CreateChatResponse> {
    const id = crypto.randomUUID();
    // TODO: Provider
    const chat = new GeminiChat([], model ?? "gemini-2.0-flash"); // TODO: make it use the model
    chat.id = id;
    chat.provider = provider;
    chat.label = label;
    chatsOfUsers.set(userId, new Map<string, Chat>());
    
    return {
        id,
        label,
        model,
        provider
    };
}
