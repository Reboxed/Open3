"use client";

import React, { useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import 'highlight.js/styles/github-dark.css'; // Change to preferred style
import { Message } from "./lib/types/ai";

export default function Home() {
    const [isLoading, setIsLoading] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    function onSend(message: string) {
        /* const userMessage: Message = { role: 'user', parts: [{ text: message }] };
        setMessages(prev => [...prev, userMessage]);

        setIsLoading(true);
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource(`/api/generation/chat?prompt=${encodeURIComponent(message)}&id=test`);
        eventSourceRef.current = eventSource;

        let assistantMessage = '';
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            assistantMessage += data.candidates[0].content.parts[0].text;
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage.role === 'model') {
                    lastMessage.parts = [{ text: assistantMessage }];
                    return [...newMessages];
                } else {
                    return [...newMessages, { role: 'model', parts: [{ text: assistantMessage }] } as Message];
                }
            });
        };

        eventSource.onerror = () => {
            eventSource.close();
            setIsLoading(false);
        };

        eventSource.addEventListener('done', () => {
            eventSource.close();
            setIsLoading(false);
        }); */
    }

    return (
        <div className="min-w-full min-h-full flex flex-col justify-center items-center">
            <ChatInput onSend={onSend} loading={isLoading} className="w-[80%] max-w-[1000px] max-md:w-[90%]" />
        </div>
    );
}

