"use client";

//
// If you're seeign this code please let me tell you i was the only person working on this project actively
// trying to carry it with as many features as possible. the moment this cloneathon is over i will rewrite
// this entire thing. that is. if i win.
//

import React, { useState, useTransition, useEffect } from "react";
import ChatInput from "./components/ChatInput";
import { useRouter } from "next/navigation";
import 'highlight.js/styles/github-dark.css'; // Change to preferred style
import { CreateChatResponse, CreateChatRequest } from "./api/chat/route";
import { ApiError } from "@/app/lib/types/api";
import { addTabs } from "./lib/utils/loadTabs";
import { useClerk } from "@clerk/nextjs";
import { useRecentChats } from "./hooks/useRecentChats";

export default function Home() {
    const [isLoading, setIsLoading] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [selectedModel, setSelectedModel] = useState<string>("");
    const [selectedProvider, setSelectedProvider] = useState<string>("");
    const [byokRequired, setByokRequired] = useState(false);
    const router = useRouter();

    useEffect(() => {
        fetch("/api/byok-required").then(res => res.json()).then(data => {
            setByokRequired(data.required);
            if (data.required) {
                window.location.href = "/settings";
            }
        });
    }, []);

    async function onSend(msg: string, attachments: { url: string; filename: string }[] = [], model?: string, provider?: string) {
        setIsLoading(true);
        const chat = await fetch("/api/chat", {
            method: "POST",
            body: JSON.stringify({
                model: model || selectedModel || "",
                provider: provider || selectedProvider || "",
            } as CreateChatRequest),
        }).then(res => res.json() as Promise<CreateChatResponse | ApiError>)
            .catch(() => undefined);
        if (!chat || "error" in chat) {
            setIsLoading(false);
            return;
        }
        sessionStorage.setItem("temp-new-tab-msg", JSON.stringify({ message: msg, attachments, tabId: chat.id }));
        addTabs(localStorage, {
            id: chat.id,
            link: `/${chat.id}`
        });
        setIsLoading(false);
        startTransition(() => {
            router.push(`/${chat.id}`);
        });
    }

    const auth = useClerk();
    const { chats: recentChats, isLoading: isRecentChatsLoading } = useRecentChats(4);
    // Dynamically set grid columns based on chat count (min 1, max 4)
    const gridCols = recentChats.length > 0 ? Math.min(4, recentChats.length) : !recentChats.length ? 1 : 4;

    // Skeleton loader for recent chats
    function RecentChatsSkeleton() {
        return (
            <div
                style={{ gridTemplateColumns: `repeat(4, minmax(0, 1fr))` }}
                className={
                    'grid gap-7 mt-5 [&>div]:flex [&>div]:flex-col [&>div]:gap-1 [&>div]:bg-[#222121]/60 [&>div]:rounded-[48px] [&>div]:shadow-[0_8px_20px_rgba(0,0,0,0.1)]/30 [&>div]:p-8 [&>div]:overflow-clip'
                }
            >
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="w-full h-[228px] animate-pulse cursor-default">
                        <div className="h-6 w-2/3 bg-neutral-700 rounded mb-3" />
                        <div className="h-4 w-full bg-neutral-800 rounded mb-2" />
                        <div className="h-4 w-5/6 bg-neutral-800 rounded mb-2" />
                        <div className="h-4 w-4/6 bg-neutral-800 rounded" />
                    </div>
                ))}
            </div>
        );
    }

    if (byokRequired) {
        return null;
    }

    return (
        <div className="min-w-full min-h-0 flex-1 flex flex-col justify-center items-center">
            <div className="flex flex-col h-fit gap-2 w-[80%] max-w-[1000px] max-md:w-[90%]">
                <h2>Welcome back, {auth.user?.fullName ?? auth.user?.username ?? "loading..."}</h2>
                <ChatInput
                    onSend={onSend}
                    loading={isLoading || isPending}
                    className={`w-full ${(isLoading || isPending) ? "opacity-35" : "opacity-100"} transition-opacity duration-500 overflow-clip`}
                    onModelChange={(model, provider) => {
                        setSelectedModel(model);
                        setSelectedProvider(provider);
                    }}
                />
                {isRecentChatsLoading && (
                    <RecentChatsSkeleton />
                )}
                {!isRecentChatsLoading && recentChats.length === 0 && auth.user && (
                    <div className="w-full flex h-[230px] justify-center text-neutral-400 py-4 drop-shadow-md">
                        Here your recent chats will show! Start a new chat to see them here
                    </div>
                )}
                <div
                    style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
                    className={`grid gap-7 mt-5 [&>div]:flex [&>div]:flex-col [&>div]:gap-1 [&>div]:bg-[#222121]/80 [&>div]:rounded-[48px] [&>div]:shadow-[0_8px_20px_rgba(0,0,0,0.1)]/30 [&>div]:p-8 [&>div]:overflow-clip`}
                >
                    {recentChats.map(chat => (
                        <div key={chat.id} className="w-full h-[230px] cursor-pointer" onClick={() => {
                            addTabs(localStorage, {
                                id: chat.id,
                                label: chat.label ?? "New Tab",
                                link: `/${chat.id}`
                            });

                            setTimeout(() => {
                                router.push(`/${chat.id}`)
                            }, 75); // Delay to allow navigation to start
                        }}>
                            <span className="!text-white line-clamp-1">{chat.label || "Untitled"}</span>
                            <p className="opacity-65 line-clamp-6 whitespace-pre-line">
                                {chat.firstResponse || <span className="italic opacity-40">No LLM response yet.</span>}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

