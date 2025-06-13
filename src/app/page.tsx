"use client";

import React, { useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import 'highlight.js/styles/github-dark.css'; // Change to preferred style
import { ApiError, CreateTabRequest, CreateTabResponse } from "./api/tab/route";
import { redirect } from "next/navigation";

export default function Home() {
    const [isLoading, setIsLoading] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    async function onSend(message: string) { 
        const tabsReq = await fetch(`/api/tabs?user_id=test`, {
            method: "POST",
            body: JSON.stringify({
                label: "New Chat",
                chatProperties: {
                    label: "New Chat",
                    model: "gemini-2.0-flash",
                    provider: "google", // Specify the provider
                }
            } as CreateTabRequest),
        });
        const tab = await tabsReq.json() as CreateTabResponse | ApiError;
        if ("error" in tab) {
            return
        }
        redirect(`/${tab.id}`);
    }

    return (
        <div className="min-w-full min-h-full flex flex-col justify-center items-center">
            <ChatInput onSend={onSend} loading={isLoading} className="w-[80%] max-w-[1000px] max-md:w-[90%]" />
        </div>
    );
}

