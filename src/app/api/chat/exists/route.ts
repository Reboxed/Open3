import { NextResponse } from "next/server";
import redis, { USER_CHATS_KEY } from "@/app/lib/redis";
import { auth } from "@clerk/nextjs/server";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
    if (!redis) {
        return NextResponse.json({
            error: "Redis connection failure"
        }, { status: 500 })
    }

    const user = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!user.userId) return NextResponse.json({ exists: [] }, { status: 401 });

    let ids: string[] = [];
    try {
        const body = await req.json();
        ids = Array.isArray(body.ids) ? body.ids : [];
    } catch {
        return NextResponse.json({ exists: [] }, { status: 400 });
    }

    const chatList = await redis.lrange(USER_CHATS_KEY(user.userId), 0, -1);
    // Return an array of booleans for each id
    const exists = ids.map(id => chatList.includes(id));
    return NextResponse.json({ exists });
}
