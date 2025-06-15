import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_PROVIDERS } from "./[id]/send/route";
import { Chat, GeminiChat } from "@/app/lib/types/ai";
import { auth, currentUser } from "@clerk/nextjs/server";
import { USER_CHATS_INDEX_KEY, USER_CHATS_KEY } from "@/app/lib/redis";
import "@/app/lib/redis";

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

export interface GetChat extends Chat {
    id: string;
}

export interface GetChatsResponse {
    chats: GetChat[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

export async function GET(req: NextRequest) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failured"
        }, { status: 500 })
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!user.userId) return NextResponse.json({ exists: [] }, { status: 401 });

    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

    if (page < 1) {
        return NextResponse.json({ error: 'Page must be greater than 0' }, { status: 400 });
    }
    if (limit < 1 || limit > 100) {
        return NextResponse.json({ error: 'Limit must be between 1 and 100' }, { status: 400 });
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const chatIds = await redis.zrevrange(USER_CHATS_INDEX_KEY(user.userId), startIndex, endIndex);
    if (chatIds.length === 0) {
        return NextResponse.json({
            chats: [],
            total: 0,
            page,
            limit,
            hasMore: false
        }, { status: 200 });
    }

    // Get chat data from hash
    const rawChats = await redis.hmget(USER_CHATS_KEY(user.userId), ...chatIds);
    const chats = rawChats
        .map((chatStr, i) => {
            try {
                return chatStr ? {
                    ...JSON.parse(chatStr),
                    id: chatIds[i],
                } : null;
            } catch {
                // Optional: log/skip broken chat
                return null;
            }
        })
        .filter(Boolean); // remove nulls

    // Get total count once (not paginated)
    const total = await redis.zcard(USER_CHATS_INDEX_KEY(user.userId));

    return NextResponse.json({
        chats,
        total,
        page,
        limit,
        hasMore: endIndex < total
    } as GetChatsResponse, { status: 200 });
}

export async function POST(req: NextRequest) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 });
    }

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
    if (!redis) throw "Redis connection failure";

    const id = crypto.randomUUID();
    // TODO: Provider
    const chat = new GeminiChat([], model ?? "gemini-2.0-flash"); // TODO: make it use the model
    chat.provider = provider;
    chat.label = label;

    const result = await redis.multi()
        .hset(USER_CHATS_KEY(userId), id, JSON.stringify({
            label: chat.label,
            model: chat.model,
            provider: chat.provider,
            createdAt: Date.now(),
        }))
        .zadd(USER_CHATS_INDEX_KEY(userId), Date.now(), id)
        .exec();

    // Check for failure
    if (!result || result.some(([err]) => err)) {
        // Optionally: clean up in case partial state exists
        await redis.hdel(USER_CHATS_KEY(userId), id);
        throw new Error("Failed to save chat to Redis");
    }

    return {
        id,
        label,
        model,
        provider
    };
}
