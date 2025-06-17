import { NextResponse } from "next/server";
import redis, { USER_CHATS_INDEX_KEY, USER_CHATS_KEY } from "@/internal-lib/redis";
import { auth } from "@clerk/nextjs/server";
import { ApiError } from "@/internal-lib/types/api";

export async function POST(req: Request) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        } as ApiError, { status: 500 });
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    if (!user.userId) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });

    let ids: string[] = [];
    try {
        const body = await req.json();
        ids = Array.isArray(body.ids) ? body.ids : [];
    } catch {
        return NextResponse.json({ error: "Something went wrong" } as ApiError, { status: 400 });
    }

    const chatList = await redis.zrange(USER_CHATS_INDEX_KEY(user.userId), 0, -1);
    // Return an array of booleans for each id
    const exists = ids.map(id => chatList.includes(id));
    return NextResponse.json({ exists });
}
