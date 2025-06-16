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
import { loadMessagesFromServer, migrateMessagesFromLocalStorage } from "../lib/utils/messageUtils";

export default function Chat() {
    const params = useParams();
    const tabId = params.id?.toString() ?? "";

    const [messages, setMessages] = useState<Message[]>([]);
    const messagesRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [messagesLoading, setMessagesLoading] = useState(true);
    const eventSourceRef = useRef<EventSource | null>(null);

    // Load messages from Redis when component mounts or tabId changes
    useEffect(() => {
        async function loadMessages() {
            if (!tabId) return;

            setMessagesLoading(true);

            // First, try to migrate any existing localStorage messages
            await migrateMessagesFromLocalStorage(tabId);

            // Then load messages from Redis
            const serverMessages = await loadMessagesFromServer(tabId);
            setMessages(serverMessages);
            setMessagesLoading(false);

            const tempMessage = sessionStorage.getItem("temp-new-tab-msg");
            if (tempMessage && !serverMessages.length) {
                onSend(tempMessage);
            } else {
                sessionStorage.removeItem("temp-new-tab-msg");
            }
        }

        loadMessages();
    }, [tabId]);

    // Auto-scroll when messages change
    useEffect(() => {
        if (!messagesLoading && messages.length > 0) {
            const messagesElement = messagesRef.current;
            if (messagesElement) {
                window.scrollTo({
                    behavior: "smooth",
                    top: messagesElement.scrollHeight,
                })
            }
        }
    }, [messages, messagesLoading]);

    function onSend(message: string) {
        // Add user message optimistically to UI
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

        function generateTitle() {
            // Start title generation if this is the first message and chat doesn't have a title
            if (messages.length === 0) {
                console.log("Starting title generation for chat:", tabId);
                fetch(`/api/chat/title/generate?id=${tabId}`)
                    .then(async response => {
                        if (!response.ok) {
                            throw new Error(`Failed to start title generation: ${response.statusText}`);
                        }
                        const message = await response.json();
                        if ("title" in message) {
                            console.log("Fallback title generation started successfully:", message.title);
                            // Emit window event to update title in Navbar
                            window.dispatchEvent(new CustomEvent('chatTitleUpdate', {
                                detail: {
                                    chatId: tabId,
                                    title: message.title
                                }
                            }));
                        }
                    })
                    .catch(error => {
                        console.warn('Failed to start title generation:', error);
                    });
            }
        }

        eventSource.onerror = () => {
            eventSource.close();
            setIsLoading(false);
            generateTitle();
            // Reload messages from server in case of error to sync state
            loadMessagesFromServer(tabId).then(setMessages);
        };

        eventSource.addEventListener("done", () => {
            eventSource.close();
            setIsLoading(false);
            generateTitle();
            // Reload messages from server to ensure we have the latest state
            loadMessagesFromServer(tabId).then(setMessages);
        });
    }

    return (
        <div className="min-w-full min-h-full flex flex-col justify-between items-center py-6 gap-8">
            <div className="w-[80%] max-md:w-[90%] max-w-[1000px] max-h-full overflow-x-clip grid gap-4 grid-cols-[0.1fr_0.9fr]" ref={messagesRef}>
                {messagesLoading ? (
                    <div className="col-span-2 flex justify-center items-center py-8">
                        <span className="text-neutral-400">Loading messages...</span>
                    </div>
                ) : (
                    messages.map((message, idx) => (
                        <MessageBubble key={`${message.role}-${idx}`} message={message} />
                    ))
                )}
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


