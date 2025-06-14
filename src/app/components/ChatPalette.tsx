"use client";

import useSWR from "swr";
import { GetChatsResponse } from "../api/chat/route";
import { ApiError } from "../lib/types/api";
import { FormEventHandler, useRef, useState } from "react";

interface ChatPaletteProps {
    className?: string;
    hidden?: boolean;
}

export default function ChatPalette({ className, hidden }: ChatPaletteProps) {
    const inputRef = useRef<HTMLInputElement>()
    const [showLabel, setShowLabel] = useState(true);

    const { data } = useSWR("/api/chat", async path => {
        return fetch(path).then(res => res.json() as Promise<GetChatsResponse | ApiError>);
    });
    const chats = data && !("error" in data) ? data : {
        chats: [],
        hasMore: false,
        limit: 0,
        page: 0,
        total: 0
    } as GetChatsResponse;

    const onInput: FormEventHandler<HTMLInputElement> = (event) => {
        const value = event.currentTarget.value;
        setShowLabel(!value.length)
    }

    return (
        <div className={`fixed flex flex-col items-stretch gap-5 w-7/12 max-w-[1100px] left-1/2 top-1/2 -translate-1/2 z-20 ${hidden ? "pointer-events-none" : ""} transition-all duration-500 ease-in-out ${className}`}>
            <div
                className={`
                    flex bg-[rgba(36,36,36,0.75)] gap-3 p-4 items-center justify-stretch pr-5
                    backdrop-blur-2xl shadow-highlight rounded-2xl cursor-text
                    transition-all duration-250
                    ${hidden ? "!bg-[rgba(36,36,36,0)] !backdrop-blur-none opacity-0" : ""}
                `}
                onClick={() => inputRef.current?.focus()}
            >
                <div className="bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl text-transparent">
                    .
                </div>
                <div className="relative w-full">
                    <label htmlFor="search" hidden={!showLabel} className="text-neutral-300/60 left-0 absolute pointer-events-none">
                        Search your chats...
                    </label>
                    <input ref={inputRef} onInput={onInput} id="search" className="w-full outline-none" />
                </div>
            </div>
            <div
                className={`
                    flex bg-[rgba(36,36,36,0.75)] gap-3 items-center justify-stretch pr-5
                    backdrop-blur-2xl shadow-highlight rounded-2xl cursor-text
                    transition-all duration-250
                    ${hidden ? "!bg-[rgba(36,36,36,0)] !backdrop-blur-none opacity-0" : ""}
                `}
            >
                <ul>
                    {chats.chats.map(chat => (
                        <li key={chat.id} className="p-4 min-h-[64px] flex gap-4 items-center">
                            <div className="bg-white/10 backdrop-blur-xl z-10 w-8 h-8 rounded-xl text-transparent">
                                .
                            </div>
                            {chat.label ?? "New Chat"}
                        </li>
                    ))}
                    {!chats.chats.length && (
                        <li className="p-4 px-5.5 flex gap-4 min-h-[64px] items-center">
                            <span>no chats? create a chat by typing anything in the Open3 chat!</span>
                        </li>
                    )}
                </ul>
            </div>
        </div>
    )
}

