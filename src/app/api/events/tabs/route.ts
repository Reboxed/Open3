import { currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, ApiTab } from "../../tabs/route";
import eventBus from "@/app/lib/eventBus";

export const TAB_CREATED_EVENT = (userId: string) => `tab-created-${userId}`;
export const TAB_DELETED_EVENT = (userId: string) => `tab-deleted-${userId}`;
export async function GET(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." } as ApiError, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Banned." } as ApiError, { status: 401 });


    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            const send = (event: string, data: ApiTab) => {
                const message = `data: ${JSON.stringify({
                    event: event,
                    data: data
                })}\n\n`;
                controller.enqueue(encoder.encode(message));
            };

            const onTabCreated = (data: ApiTab) => send(TAB_CREATED_EVENT(user.id), data);
            eventBus.on(TAB_CREATED_EVENT(user.id), onTabCreated);

            const onTabDeleted = (data: ApiTab) => send(TAB_DELETED_EVENT(user.id), data);
            eventBus.on(TAB_DELETED_EVENT(user.id), onTabDeleted);
            
            req.signal.addEventListener("abort", () => {
                console.log("Lost connection with " + user.id + " :<")
                eventBus.off(TAB_CREATED_EVENT(user.id), onTabCreated);
                eventBus.off(TAB_DELETED_EVENT(user.id), onTabDeleted);
                controller.close();
            })
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}
