import { NextApiRequest } from "next";
import { createChat, CreateChatRequest, CreateChatResponse } from "../chat/[userId]/route";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export interface ApiError {
    error: string;
}

export interface CreateTabResponse {
    id: string;
    label: string;
    userId: string;
    chatId?: string;
    chatProperties?: CreateChatResponse; // If chatId is provided, this will be null
}

export interface CreateTabRequest {
    label: string;
    chatId?: string; // Optional, if associating with an existing chat
    chatProperties?: CreateChatRequest; // Optional, if creating a new chat
}

export interface ApiTab {
    id: string;
    label: string;
    userId: string;
    link: string;
    chatId?: string; // Optional, if associating with an existing chat
}

const tabsOfUser = new Map<string, Map<string, ApiTab>>();
export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });

    const { label, chatId, chatProperties } = await req.json() as CreateTabRequest;
    const doCreateChat = req.nextUrl.searchParams.get("create");
    if (!label) {
        return NextResponse.json({ error: "ID and label are required" }, { status: 400 });
    }

    let result: CreateChatResponse | undefined;
    if (doCreateChat === "1" || doCreateChat === "true") {
        if (chatId) {
            return NextResponse.json({ error: "Chat ID must not be provided when creating a new associated chat" }, { status: 400 });
        }
        if (!chatProperties) {
            return NextResponse.json({ error: "Chat properties are required when creating a new associated chat" }, { status: 400 });
        }

        try {
            result = await createChat(user.id, chatProperties);
        } catch (error) {
            return NextResponse.json({ error: "Failed to create chat" }, { status: 200 });
        }
    }

    const id = crypto.randomUUID();
    const tabs = tabsOfUser.get(user.id) || new Map<string, ApiTab>();
    tabs.set(id, { label, id, userId: user.id, link: `/${id}`, chatId: chatId || result?.id });
    tabsOfUser.set(user.id, tabs);

    // Here you would typically save the tab to a database or in-memory store
    // For this example, we will just return the tab as is
    return NextResponse.json({ id, label, chatId, userId: user.id, chatProperties: result } as CreateTabResponse, { status: 201 });
}

export async function GET() {
    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });

    const tabs = tabsOfUser.get(user.id) || new Map<string, ApiTab>();
    const response = Array.from(tabs.values());
    return NextResponse.json(response, { status: 200 });
}

export async function DELETE(req: NextApiRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json([], { status: 401 });
    if (user.banned) return NextResponse.json([], { status: 401 });

    const { id } = await req.body as { id: string };
    if (!id) {
        return NextResponse.json({ error: "User ID (user_id) is required" }, { status: 400 });
    }

    const tabs = tabsOfUser.get(user.id);
    if (!tabs || !tabs.has(id)) {
        return NextResponse.json({ error: "Tab not found " }, { status: 404 });
    }

    tabs.delete(id);
    if (tabs.size === 0) {
        tabsOfUser.delete(user.id);
    }
    tabsOfUser.set(user.id, tabs);

    return NextResponse.json({ success: true }, { status: 200, });
}
