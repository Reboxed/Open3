"use client";

import React, { useEffect, useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import Markdown, { Components } from 'react-markdown';
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css'; // Change to preferred style
import rehypeLineNumbers from "./lib/utils/rehypeLineNumbers";

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

const MemoizedCodeBlock = React.memo(function CodeBlock({
    language,
    value,
}: {
    language: string;
    value: string;
}) {
    const codeRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (codeRef.current) {
            hljs.highlightElement(codeRef.current);
        }
    }, [value]); // Re-highlight when value changes

    return (
        <pre>
            <code ref={codeRef} className={`language-${language}`}>
                {value}
            </code>
        </pre>
    );
});

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
        const userMessage: Message = { role: 'user', content: message };
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

    return (
        <div className="min-w-full min-h-full flex flex-col justify-between items-center py-6">
            <div className="w-[800px] max-h-full grid gap-4 grid-cols-[0.1fr_0.9fr]">
                {messages.map((message, idx) => (
                    <MessageBubble key={`${message.role}-${idx}`} message={message} />
                ))}
            </div>
            <ChatInput onSend={onSend} loading={isLoading} />
        </div>
    );
}

const MarkdownComponents: Components = {
    code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const language = match?.[1] || '';

        return !inline && language ? (
            <MemoizedCodeBlock
                language={language}
                value={String(children).replace(/\n$/, '')}
            />
        ) : (
            <code className={className} {...props}>
                {children}
            </code>
        );
    },
};

const MessageBubble = ({ message }: { message: Message }) => {
    const isUser = message.role === 'user';
    const className = isUser
        ? "px-6 py-4 rounded-2xl bg-white/[0.06] mb-2 col-start-2 justify-self-end"
        : "p-2 mb-2 col-span-2";

    return (
        <div className={className}>
            <Markdown rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeLineNumbers]} remarkPlugins={[remarkGfm]}>
                {message.content}
            </Markdown>
        </div>
    );
};

MessageBubble.displayName = "MessageBubble";

