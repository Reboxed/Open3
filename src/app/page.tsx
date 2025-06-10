"use client";

import { useEffect, useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import Markdown, { Components } from 'react-markdown';
import remarkGfm from "remark-gfm";

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import rehypeRaw from "rehype-raw";

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function Home() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
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

    const markdownComponents: Components = {
        code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');

            return !inline && match ? (
                <SyntaxHighlighter style={oneDark} language={match[1]} {...props}>
                    {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
            ) : (
                    <code className={className} {...props}>
                        {children}
                    </code>
                );
        },
    }

    return (
        <div className="min-w-full min-h-full flex flex-col justify-between items-center py-6">
            <div className="w-[800px] max-h-full grid gap-4 grid-cols-[0.1fr_0.9fr]">
                {messages.map((message) => {
                    return (
                        message.role === 'user' ? (
                            <div key={Math.random()} className="px-6 py-4 rounded-2xl bg-white/[0.06] mb-2 col-start-2 justify-self-end">
                                <Markdown components={markdownComponents} rehypePlugins={rehypeRaw} remarkPlugins={remarkGfm}>{message.content}</Markdown>
                            </div>
                        ) : (
                                <div key={Math.random()} className="p-2 mb-2 col-span-2">
                                    <Markdown components={markdownComponents} rehypePlugins={rehypeRaw} remarkPlugins={remarkGfm}>{message.content}</Markdown>
                                </div>
                            )
                    );
                })}
            </div>
            <ChatInput onSend={onSend} loading={isLoading} />
        </div>
    );
}

