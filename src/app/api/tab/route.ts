import { NextApiRequest, NextApiResponse } from "next";
import { createChat, CreateChatRequest, CreateChatResponse } from "../chat/route";

export interface ApiError {
    error: string;
}

interface CreateTabResponse {
    id: string;
    label: string;
    userId: string;
    chatId?: string;
    chatProperties?: CreateChatResponse; // If chatId is provided, this will be null
}

interface CreateTabRequest {
    label: string;
    userId: string;
    chatId?: string; // Optional, if associating with an existing chat
    chatProperties?: CreateChatRequest; // Optional, if creating a new chat
}

interface ApiTab {
    id: string;
    label: string;
    userId: string;
    chatId?: string; // Optional, if associating with an existing chat
}

const tabsOfUser = new Map<string, Map<string, ApiTab>>();
export async function POST(req: NextApiRequest, res: NextApiResponse<CreateTabResponse | ApiError>) {
    const { label, chatId, userId, chatProperties } = await req.body as CreateTabRequest;
    const doCreateChat = req.query["create"];
    if (!label) {
        return res.status(400).json({ error: "ID and label are required" });
    }

    let result: CreateChatResponse | undefined;
    if (doCreateChat === "1" || doCreateChat === "true") {
        if (chatId) {
            return res.status(400).json({ error: "Chat ID must not be provided when creating a new associated chat" });
        }
        if (!chatProperties) {
            return res.status(400).json({ error: "Chat properties are required when creating a new associated chat" });
        }

        try {
            result = await createChat(chatProperties);
        } catch (error) {
            return res.status(500).json({ error: "Failed to create chat" });
        }
    }

    const id = crypto.randomUUID();
    const tabs = tabsOfUser.get(userId) || new Map<string, ApiTab>();
    tabs.set(id, { label, id, userId, chatId: chatId || result?.id });
    tabsOfUser.set(userId, tabs);

    // Here you would typically save the tab to a database or in-memory store
    // For this example, we will just return the tab as is
    return res.status(201).json({ id, label, chatId, userId, chatProperties: result });
}

export async function GET(req: NextApiRequest, res: NextApiResponse<ApiTab[] | ApiError>) {
    const userId = req.query["user_id"] as string;
    if (!userId) {
        return res.status(400).json({ error: "User ID (user_id) is required" });
    }

    const tabs = tabsOfUser.get(userId);
    if (!tabs) {
        return res.status(404).json([]);
    }

    const response = Array.from(tabs.values());
    return res.status(200).json(response);
}

export async function DELETE(req: NextApiRequest, res: NextApiResponse<ApiError | { success: boolean }>) {
    const { id, userId } = await req.body as { id: string; userId: string };
    if (!id || !userId) {
        return res.status(400).json({ error: "ID and user ID are required" });
    }

    const tabs = tabsOfUser.get(userId);
    if (!tabs || !tabs.has(id)) {
        return res.status(404).json({ error: "Tab not found" });
    }

    tabs.delete(id);
    if (tabs.size === 0) {
        tabsOfUser.delete(userId);
    }

    return res.status(200).json({ success: true });
}
