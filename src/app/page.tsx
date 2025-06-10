"use client";

import { useEffect, useRef, useState } from "react";
import ChatInput from "./components/ChatInput";

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function Home() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const savedMessages = localStorage.getItem("geminiMessages");
        if (savedMessages) {
            setMessages(JSON.parse(savedMessages));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("geminiMessages", JSON.stringify(messages));
    }, [messages]);

    function onSend(message: string) {
        const userMessage: Message = { role: 'user', content: message};
        setMessages(prev => [...prev, userMessage]);

        setInputValue("");
        setIsLoading(true);
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource(`/api/generation/gemini?prompt=${encodeURIComponent(message)}`);
        eventSourceRef.current = eventSource;

        let assistantMessage = '';

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            assistantMessage += data.text;
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage.role === 'assistant') {
                    lastMessage.content = assistantMessage;
                    return [...newMessages];
                } else {
                    return [...newMessages, { role: 'assistant', content: assistantMessage }];
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
        });
    }

    return (
        <div className="min-w-full min-h-full flex flex-col gap-4 justify-between items-center p-4">
            <div className="w-full max-h-full">{messages.map((message) => {
                return (
                    message.role === 'user' ? (
                        <div key={Math.random()} className="p-2 rounded-lg mb-2">
                            <strong>You</strong><br/>
                            {message.content}
                        </div>
                    ) : (
                        <div key={Math.random()} className="p-2 rounded-lg mb-2">
                            <strong>Assistant</strong><br/>
                            {message.content}
                        </div>
                    )
                );
            })}</div>
            <ChatInput onSend={onSend} loading={isLoading} onInput={(msg) => setInputValue(msg)} value={inputValue} />
        </div>
    );
}

