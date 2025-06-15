"use client";

import React, { useState } from "react";
import ChatInput from "./components/ChatInput";
import 'highlight.js/styles/github-dark.css'; // Change to preferred style
import { useRouter } from "next/navigation";
import { CreateChatResponse, CreateChatRequest } from "./api/chat/route";
import { ApiError } from "@/app/lib/types/api";
import { addTabs } from "./lib/utils/loadTabs";
import { useClerk } from "@clerk/nextjs";

export default function Home() {
    const [isLoading, setIsLoading] = useState(false);

    const router = useRouter();
    async function onSend(msg: string) {
        sessionStorage.setItem("temp-new-tab-msg", msg)
        setIsLoading(true);

        const chat = await fetch("/api/chat", {
            method: "POST",
            body: JSON.stringify({
                label: "New Chat",
                model: "gemini-2.0-flash",
                provider: "google", // Specify the provider
            } as CreateChatRequest),
        }).then(res => res.json() as Promise<CreateChatResponse | ApiError>)
            .catch(() => undefined);
        if (!chat || "error" in chat) return;

        addTabs(localStorage, {
            id: chat.id,
            label: chat.label,
            link: `/${chat.id}`
        });

        router.push(`/${chat.id}`);
    }

    const auth = useClerk();
    return (
        <div className="min-w-full min-h-full flex flex-col justify-center items-center">
            <div className="flex flex-col gap-2 w-[80%] max-w-[1000px] max-md:w-[90%]">
                <h2>Welcome back, {auth.user?.fullName ?? auth.user?.username ?? "loading..."}</h2>
                <ChatInput onSend={onSend} loading={isLoading} className={`w-full opacity-100 opacity-50 ${isLoading ? "!opacity-35" : ""} transition-opacity duration-500 overflow-clip`} />
                <div className="grid grid-cols-4 gap-7 mt-5 [&>div]:flex [&>div]:flex-col [&>div]:gap-1 [&>div]:bg-[#222121] [&>div]:rounded-[48px] [&>div]:shadow-[0_8px_20px_rgba(0,0,0,0.1)]/30 [&>div]:p-8 [&>div]:overflow-clip">
                    <div className="w-full h-full aspect-square">
                        <span className="!text-white line-clamp-1">Pygame bouncing ball in spinning</span>
                        <p className="opacity-65 line-clamp-6">
                            Hey, can you generate me an application in pygame that contains a hexagon in which balls physically accurate bounce around and fuck around.
                        </p>
                    </div>
                    <div className="w-full h-full aspect-square">
                        <span className="!text-white line-clamp-1">Pygame bouncing ball in spinning</span>
                        <p className="opacity-65 line-clamp-6">
                            Hey, can you generate me an application in pygame that contains a hexagon in which balls physically accurate bounce around and fuck around.
                        </p>
                    </div>
                    <div className="w-full h-full aspect-square">
                        <span className="!text-white line-clamp-1">Pygame bouncing ball in spinning</span>
                        <p className="opacity-65 line-clamp-6">
                            Hey, can you generate me an application in pygame that contains a hexagon in which balls physically accurate bounce around and fuck around.
                        </p>
                    </div>
                    <div className="w-full h-full aspect-square">
                        <span className="!text-white line-clamp-1">Pygame bouncing ball in spinning</span>
                        <p className="opacity-65 line-clamp-6">
                            Hey, can you generate me an application in pygame that contains a hexagon in which balls physically accurate bounce around and fuck around.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

