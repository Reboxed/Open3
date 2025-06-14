"use client";

import React, { useEffect, useRef, useState } from "react";
import ChatInput from "../components/ChatInput";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css"; // Change to preferred style
import { Message } from "../lib/types/ai";
import { escape } from "html-escaper";
import rehypeClassAll from "../lib/utils/rehypeClassAll";
import { useParams } from "next/navigation";

export default function Chat() {
    const params = useParams();
    const tabId = params.id?.toString() ?? "";
    const MESSAGES_ID = `messages-${tabId}`;

    const [messages, setMessages] = useState<Message[]>([]);
    const messagesRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const savedMessages = localStorage.getItem(MESSAGES_ID);
        if (savedMessages) {
            setMessages(JSON.parse(savedMessages));
        }
    }, [tabId]);

    useEffect(() => {
        if (messages.length != 0 || !localStorage.getItem(MESSAGES_ID)) {
            if (!messages.length) {
                localStorage.removeItem(MESSAGES_ID);
                return;
            }

            localStorage.setItem(MESSAGES_ID, JSON.stringify(messages));
            const messagesElement = messagesRef.current;
            if (messagesElement) {
                window.scrollTo({
                    behavior: "smooth",
                    top: messagesElement.scrollHeight,
                })
            }
        }
    }, [messages, tabId]);

    function onSend(message: string) {
        const userMessage: Message = { role: "user", parts: [{ text: message }] };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        if (eventSourceRef.current?.OPEN) return;
        if (eventSourceRef.current) eventSourceRef.current.close();

        const eventSource = new EventSource(`/api/chat/${tabId}/send?prompt=${encodeURIComponent(message)}`);
        eventSourceRef.current = eventSource;

        let assistantMessage = "";
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            assistantMessage += data.candidates[0].content.parts[0].text;
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage.role === "model") {
                    lastMessage.parts = [{ text: assistantMessage }];
                    return [...newMessages];
                } else {
                    return [...newMessages, { role: "model", parts: [{ text: assistantMessage }] } as Message];
                }
            });
        };

        eventSource.onerror = () => {
            eventSource.close();
            setIsLoading(false);
        };

        eventSource.addEventListener("done", () => {
            eventSource.close();
            setIsLoading(false);
        });
    }

    return (
        <div className="min-w-full min-h-full flex flex-col justify-between items-center py-6 gap-8">
            <div className="w-[80%] max-md:w-[90%] max-w-[1000px] max-h-full overflow-x-clip grid gap-4 grid-cols-[0.1fr_0.9fr]" ref={messagesRef}>
                {messages.map((message, idx) => (
                    <MessageBubble key={`${message.role}-${idx}`} message={message} />
                ))}
            </div>
            <ChatInput onSend={onSend} loading={isLoading} className="w-[80%] max-md:w-[90%] max-w-[min(80%,1000px)]" />
        </div>
    );
}

const MessageBubble = ({ message }: { message: Message }) => {
    const isUser = message.role === "user";
    const className = isUser
        ? "px-6 py-4 rounded-2xl bg-white/[0.06] mb-2 col-start-2 justify-self-end"
        : "p-2 mb-2 col-span-2";

    return (
        <div className={`${className} max-w-full min-w-0`}>
            <Markdown
                skipHtml={isUser}
                unwrapDisallowed={true}
                rehypePlugins={[rehypeRaw, rehypeHighlight, [rehypeClassAll, { className: "md" }]]}
                remarkPlugins={[remarkGfm]}
            >
                {isUser ? escape(message.parts[0].text) : message.parts[0].text}
            </Markdown>
        </div>
    );
};

MessageBubble.displayName = "MessageBubble";


