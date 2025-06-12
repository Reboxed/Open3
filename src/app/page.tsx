"use client";

import React, { useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import 'highlight.js/styles/github-dark.css'; // Change to preferred style
import { Message } from "./lib/types/ai";

export default function Home() {
    const [isLoading, setIsLoading] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    function onSend(message: string) {
        
    }

    return (
        <div className="min-w-full min-h-full flex flex-col justify-center items-center">
            <ChatInput onSend={onSend} loading={isLoading} className="w-[80%] max-w-[1000px] max-md:w-[90%]" />
        </div>
    );
}

