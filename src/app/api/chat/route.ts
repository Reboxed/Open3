import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_PROVIDERS } from "@/app/lib/types/ai";
import { Chat } from "@/app/lib/types/ai";
import { auth, currentUser } from "@clerk/nextjs/server";
import redis, { USER_CHATS_INDEX_KEY, USER_CHATS_KEY, USER_PINNED_CHATS_KEY } from "@/internal-lib/redis";
import "@/internal-lib/redis";
import { byokAvailable } from "@/internal-lib/utils/byok";
import { getChatClass } from "@/internal-lib/utils/getChatClass";
import { CreateChatRequest, CreateChatResponse, ChatResponse, GetChatsResponse, ApiError } from "@/internal-lib/types/api";

export async function GET(req: NextRequest) {
    if (!redis) {
        return NextResponse.json({ error: "Redis connection failured" } as ApiError, { status: 500 });
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (!user.userId) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    // Pagination parameters
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "25") +1;
    if (page < 1) {
        return NextResponse.json({ error: "Page must be greater than 0" } as ApiError, { status: 400 });
    }
    if (limit < 1 || limit > 100) {
        return NextResponse.json({ error: "Limit must be between 1 and 100" } as ApiError, { status: 400 });
    }
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit - 1;

    // Fetch all pinned chat IDs (usually few)
    const pinnedChatIds = await redis.zrevrange(USER_PINNED_CHATS_KEY(user.userId), 0, -1).catch((err) => {
        console.error("Error fetching pinned chat IDs:", err);
        return [] as string[];
    });
    const totalPinned = pinnedChatIds.length;

    // Calculate how many pinned chats are on this page
    let paginatedPinned: string[] = [];
    let paginatedUnpinned: string[] = [];
    if (startIndex < totalPinned) {
        // This page includes some pinned chats
        const pinnedStart = startIndex;
        const pinnedEnd = Math.min(totalPinned - 1, endIndex);
        paginatedPinned = pinnedChatIds.slice(pinnedStart, pinnedEnd + 1);
        // If not enough pinned to fill the page, fill with unpinned
        const unpinnedNeeded = limit - paginatedPinned.length;
        if (unpinnedNeeded > 0) {
            // Unpinned offset is always 0 for first page, or (startIndex - totalPinned) for later pages
            const unpinnedOffset = Math.max(0, startIndex - totalPinned);
            // Fetch a large enough window, filter out pinned, then slice for offset and count
            const fetchWindow = (unpinnedOffset + unpinnedNeeded) * 3;
            let allUnpinned: string[] = [];
            let redisOffset = 0;
            while (allUnpinned.length < unpinnedOffset + unpinnedNeeded) {
                const batch = await redis.zrevrange(USER_CHATS_INDEX_KEY(user.userId), redisOffset, redisOffset + fetchWindow - 1).catch((err) => {
                    console.error("Error fetching chat IDs:", err);
                    return [] as string[];
                });
                if (batch.length === 0) break;
                const filtered = batch.filter(id => !pinnedChatIds.includes(id));
                allUnpinned = [...allUnpinned, ...filtered];
                redisOffset += fetchWindow;
                if (batch.length < fetchWindow) break;
            }
            paginatedUnpinned = allUnpinned.slice(unpinnedOffset, unpinnedOffset + unpinnedNeeded);
        }
    } else {
        // This page is after all pinned chats, only unpinned
        const unpinnedOffset = startIndex - totalPinned;
        const fetchWindow = (unpinnedOffset + limit) * 3;
        let allUnpinned: string[] = [];
        let redisOffset = 0;
        while (allUnpinned.length < unpinnedOffset + limit) {
            const batch = await redis.zrevrange(USER_CHATS_INDEX_KEY(user.userId), redisOffset, redisOffset + fetchWindow - 1).catch((err) => {
                console.error("Error fetching chat IDs:", err);
                return [] as string[];
            });
            if (batch.length === 0) break;
            const filtered = batch.filter(id => !pinnedChatIds.includes(id));
            allUnpinned = [...allUnpinned, ...filtered];
            redisOffset += fetchWindow;
            if (batch.length < fetchWindow) break;
        }
        paginatedUnpinned = allUnpinned.slice(unpinnedOffset, unpinnedOffset + limit);
    }
    // Merge pinned and unpinned for this page
    const paginatedChatIds = [...paginatedPinned, ...paginatedUnpinned];

    // Get chat data from hash
    const rawChats = await redis.hmget(USER_CHATS_KEY(user.userId), ...paginatedChatIds).catch((err) => {
        console.error("Error fetching chat data:", err)
        return [] as string[];
    });
    const chats = rawChats
        .map((chatStr, i) => {
            try {
                return chatStr ? {
                    ...JSON.parse(chatStr),
                    id: paginatedChatIds[i],
                } : null;
            } catch (e) {
                // This is gonna screw me over some day..
                console.error(`Failed to parse chat ${paginatedChatIds[i]}:`, e);
                return null;
            }
        })
        .filter(Boolean); // remove nulls

    // Get total count once (not paginated)
    const totalChats = await redis.zcard(USER_CHATS_INDEX_KEY(user.userId)).catch((err) => {
        console.error("Error fetching total chat count:", err);
        return 0;
    });
    const total = totalPinned + (totalChats - totalPinned);

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
        return NextResponse.json({ error: "Redis connection failure" } as ApiError, { status: 500 });
    }

    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });
    if (!byokAvailable(user)) {
        return NextResponse.json({ error: "BYOK is required for this action" } as ApiError, { status: 403 });
    }

    const { provider, model } = await req.json() as CreateChatRequest;
    if (!model) {
        return NextResponse.json({ error: "Model is required" } as ApiError, { status: 400 });
    }
    if (!provider || !AVAILABLE_PROVIDERS.includes(provider)) {
        return NextResponse.json({ error: "Provider is required and must be one of: " + AVAILABLE_PROVIDERS.join(", ") } as ApiError, { status: 400 });
    }

    const id = crypto.randomUUID();
    // Use getChatClass to instantiate the correct chat class
    const chat = getChatClass(provider, model, []);

    try {
        const result = await redis.multi()
            .hset(USER_CHATS_KEY(user.id), id, JSON.stringify({
                model: chat.model,
                provider: chat.provider,
                createdAt: Date.now(),
            } as ChatResponse))
            .zadd(USER_CHATS_INDEX_KEY(user.id), Date.now(), id)
            .exec();

        // Check for failure
        if (!result || result.some(([err]) => err)) {
            await redis.hdel(USER_CHATS_KEY(user.id), id);
            return NextResponse.json({ error: "Failed to create chat" } as ApiError, { status: 500 });
        }
    } catch (error) {
        // Idk why this may happen but i guess it might??? didnt happen to me yet
        await redis.hdel(USER_CHATS_KEY(user.id), id);
        console.error("Error creating chat:", error);
        return NextResponse.json({ error: "Failed to create chat" } as ApiError, { status: 500 });
    }

    return NextResponse.json({
        id,
        model: chat.model,
        provider: chat.provider
    } as CreateChatResponse, { status: 201 });
}
