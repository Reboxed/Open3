"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
import { loadMessagesFromServer } from "../lib/utils/messageUtils";
import Image from "next/image";

export default function Chat() {
    const params = useParams();
    const tabId = params.id?.toString() ?? "";

    const [messages, setMessages] = useState<Message[]>([]);
    const messagesRef = useRef<HTMLDivElement>(null);
    const [generating, setGenerating] = useState(false);
    const [messagesLoading, setMessagesLoading] = useState(true);
    const eventSourceRef = useRef<EventSource | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const programmaticScrollRef = useRef(false);
    const topSentinelRef = useRef<HTMLDivElement>(null);

    const fetchMessages = useCallback(async () => {
        setMessagesLoading(true);
        const serverMessages = await loadMessagesFromServer(tabId);
        setMessagesLoading(false);
        return serverMessages;
    }, [tabId]);

    useEffect(() => {
        if (!tabId) return;
        async function loadInitial() {
            const serverMessages = await fetchMessages();
            console.log("Loaded messages from server:", serverMessages.messages);
            setMessages(prev => [prev, serverMessages.messages].flat());
        }
        loadInitial();
    }, [tabId, fetchMessages]);

    useEffect(() => {
        if (!messagesLoading && messages.length > 0 && autoScroll) {
            const messagesElement = messagesRef.current;
            if (messagesElement) {
                programmaticScrollRef.current = true;
                window.scrollTo({
                    behavior: "smooth",
                    top: messagesElement.scrollHeight,
                });
                setTimeout(() => {
                    programmaticScrollRef.current = false;
                }, 100);
            }
        }
    }, [messages, messagesLoading, autoScroll]);

    useEffect(() => {
        const tempNewMsg = sessionStorage.getItem("temp-new-tab-msg");
        if (tempNewMsg) {
            try {
                const parsedMsg = JSON.parse(tempNewMsg);
                if (parsedMsg.tabId === tabId) {
                    onSend(parsedMsg.message, parsedMsg.attachments || []);
                    sessionStorage.removeItem("temp-new-tab-msg");
                }
            } catch { }
        }

        let lastScrollY = window.scrollY;
        function handleScroll() {
            if (programmaticScrollRef.current) {
                lastScrollY = window.scrollY;
                return;
            }
            const messagesElement = messagesRef.current;
            if (!messagesElement) return;
            const currentScrollY = window.scrollY;
            const scrollPosition = currentScrollY + window.innerHeight;
            const bottomThreshold = messagesElement.scrollHeight - 100;

            if (currentScrollY < lastScrollY) {
                setAutoScroll(false);
            } else if (currentScrollY > lastScrollY) {
                if (scrollPosition >= bottomThreshold) {
                    setAutoScroll(true);
                }
            }
            lastScrollY = currentScrollY;
        }
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        if (autoScroll) {
            setTimeout(() => {
                const event = new Event('scroll');
                window.dispatchEvent(event);
            }, 0);
        }
    }, [autoScroll]);

    function handleStopAutoScroll() {
        setAutoScroll(false);
    }

    function handleScrollToBottom() {
        const messagesElement = messagesRef.current;
        if (messagesElement) {
            programmaticScrollRef.current = true;
            window.scrollTo({
                behavior: "smooth",
                top: messagesElement.scrollHeight,
            });
            setTimeout(() => {
                programmaticScrollRef.current = false;
            }, 100);
            setAutoScroll(true);
        }
    }

    function onSend(message: string, attachments: { url: string; filename: string }[] = []) {
        // Add user message optimistically to UI
        const userMessage: Message = { role: "user", parts: [{ text: message }], attachments: attachments.length > 0 ? attachments : undefined };
        setMessages(prev => [...prev, userMessage]);
        setGenerating(true);

        if (eventSourceRef.current) eventSourceRef.current.close();
        const attachmentsParam = attachments.length > 0 ? `&attachments=${encodeURIComponent(JSON.stringify(attachments))}` : '';
        const eventSource = new EventSource(`/api/chat/${tabId}/send?prompt=${encodeURIComponent(message)}${attachmentsParam}`);
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
            setGenerating(false);
            loadMessagesFromServer(tabId).then(r => setMessages(r.messages));
        };

        eventSource.addEventListener("done", () => {
            eventSource.close();
            setGenerating(false);
            loadMessagesFromServer(tabId).then(r => setMessages(r.messages));
        });
    }

    return (
        <div className="min-h-0 flex-1 w-full flex flex-col justify-between items-center py-6 gap-8">
            <div className="w-[80%] max-md:w-[90%] max-w-[1000px] max-h-full overflow-x-clip grid gap-4 grid-cols-[0.1fr_0.9fr]" ref={messagesRef}>
                <div ref={topSentinelRef} style={{ height: 1 }} />
                {messagesLoading ? (
                    <div className="col-span-2 flex justify-center items-center py-8">
                        <span className="text-neutral-400">Loading messages...</span>
                    </div>
                ) : (
                    <>
                        {messages.map((message, idx) => (
                            <MessageBubble key={`${message.role}-${idx}`} message={message} />
                        ))}
                    </>
                )}
                {generating && (!messages[messages.length - 1] || messages[messages.length - 1]?.role !== "model") && (
                    <div className="col-span-2 flex justify-center items-center py-8">
                        <span className="text-neutral-400">Generating...</span>
                    </div>
                )}
            </div>
            {!autoScroll && (
                <button
                    onClick={handleScrollToBottom}
                    className="fixed bottom-6 right-6 z-50 bg-white/15 hover:bg-white/25 cursor-pointer text-white rounded-full p-3 shadow-lg transition-all flex items-center justify-center"
                    aria-label="Scroll to bottom"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7M12 20V4" />
                    </svg>
                </button>
            )}
            <div className="w-full flex flex-col justify-around items-center gap-4 max-w-[1000px] sticky bottom-6">
                {generating && autoScroll && (
                    <button
                        onClick={handleStopAutoScroll}
                        className="z-50 bg-white/10 hover:bg-red-500/30 cursor-pointer text-white rounded-full p-3 py-1.5 shadow-lg transition-all flex items-center justify-center"
                        aria-label="Stop automatic scroll"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Stop automatic scroll
                    </button>
                )}
                <ChatInput onSend={onSend} loading={generating} className="w-[80%] max-md:w-[90%] max-w-[1000px]" />
            </div>
        </div>
    );
}

const MessageBubble = ({ message }: { message: Message }) => {
    const isUser = message.role === "user";
    const className = isUser
        ? "px-6 py-4 rounded-2xl bg-white/[0.06] mb-2 justify-self-end"
        : "p-2 mb-2";

    // Get chatId from params for attachment URLs
    const params = useParams();
    const chatId = params.id?.toString() ?? "";

    // Memoize Markdown rendering for performance
    const renderedMarkdown = useMemo(() => {
        // Only apply syntax highlighting for model messages
        const rehypePlugins = isUser
            ? [rehypeRaw, [rehypeClassAll, { className: "md" }]]
            : [rehypeRaw, rehypeHighlight, [rehypeClassAll, { className: "md" }]];
        // Flatten plugins array for react-markdown
        return (
            <Markdown
                skipHtml={isUser}
                unwrapDisallowed={true}
                rehypePlugins={rehypePlugins as any[]}
                remarkPlugins={[remarkGfm]}
            >
                {isUser ? escape(message?.parts[0]?.text ?? "") : message.parts[0].text}
            </Markdown>
        );
    }, [isUser, message.parts]);

    const AttachmentPreview = ({ att, chatId }: { att: { url: string; filename: string }, chatId: string }) => {
        const isImage = /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(att.filename);
        const [imgSrc, setImgSrc] = React.useState(`/attachments/${chatId}/${encodeURIComponent(att.filename)}`);
        React.useEffect(() => {
            setImgSrc(`/attachments/${chatId}/${encodeURIComponent(att.filename)}`);
        }, [chatId, att.filename]);
        const handleImgError = React.useCallback(() => {
            setImgSrc(`/attachments/global/${encodeURIComponent(att.filename)}`);
        }, [att.filename]);
        if (isImage) {
            return (
                <a href={imgSrc} target="_blank" rel="noopener noreferrer" className="block">
                    <Image src={imgSrc} alt={att.filename} width={128} height={128} className="max-h-32 max-w-xs rounded-xl" style={{ objectFit: "cover" }} onError={handleImgError} />
                </a>
            );
        } else {
            return (
                <a href={`/attachments/${chatId}/${encodeURIComponent(att.filename)}`} target="_blank" rel="noopener noreferrer" className="underline text-blue-400 bg-black/10 rounded px-2 py-1 text-xs">
                    {att.filename}
                </a>
            );
        }
    };

    return (
        <div className={`${isUser ? "justify-self-end col-start-2 " : "justify-self-start col-span-2"} max-w-full`}>
            <div className={`${className} max-w-full min-w-0`}>
                {renderedMarkdown}
            </div>

            {message.attachments && message.attachments.length > 0 && (
                <div className="relative flex flex-wrap gap-2 mt-3 justify-self-end">
                    {message.attachments.map(att => (
                        <AttachmentPreview key={att.filename} att={att} chatId={chatId} />
                    ))}
                </div>
            )}
        </div>
    );
};
MessageBubble.displayName = "MessageBubble";

