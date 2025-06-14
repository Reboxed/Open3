"use client";

import React, { useEffect, useState } from "react";
import ChatInput from "./components/ChatInput";
import 'highlight.js/styles/github-dark.css'; // Change to preferred style
import { ApiError, CreateTabRequest, CreateTabResponse } from "./api/tabs/route";
import { useRouter } from "next/navigation";
import useSSE from "./hooks/useSSE";

export default function Home() {
    const [isLoading, setIsLoading] = useState(false);

    const router = useRouter();
    async function onSend() {
        setIsLoading(true);
        const tab = await fetch("/api/tabs?doCreateChat=1", {
            method: "POST",
            body: JSON.stringify({
                label: "New Chat",
                chatProperties: {
                    label: "New Chat",
                    model: "gemini-2.0-flash",
                    provider: "google", // Specify the provider
                }
            } as CreateTabRequest),
        }).then(res => res.json() as Promise<CreateTabResponse | ApiError>)
            .catch(() => undefined);
        if (!tab || "error" in tab) return;
        router.push(`/${tab.id}`);
    }

    return (
        <div className="min-w-full min-h-full flex flex-col justify-center items-center">
            <ChatInput onSend={onSend} loading={isLoading} className={`w-[80%] max-w-[1000px] max-md:w-[90%] opacity-100 opacity-50 ${isLoading ? "!opacity-35" : ""} transition-opacity duration-500`} />
        </div>
    );
}

