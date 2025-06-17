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
    const [streamError, setStreamError] = useState<string | null>(null);
    const [model, setModel] = useState<string | null>(null);
    const [provider, setProvider] = useState<string | null>(null);
    const [byokRequired, setByokRequired] = useState(false);

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
            setMessages(prev => {
                if (serverMessages.messages.length === prev.length) {
                    return prev; // No new messages, return existing
                }
                return [prev, serverMessages.messages].flat();
            });
            // Instantly scroll to bottom after initial messages load
            setTimeout(() => {
                const messagesElement = messagesRef.current;
                if (messagesElement) {
                    programmaticScrollRef.current = true;
                    window.scrollTo({
                        top: messagesElement.scrollHeight,
                        behavior: "auto"
                    });
                    setTimeout(() => {
                        programmaticScrollRef.current = false;
                    }, 100);
                }
            }, 0);
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

    const onSend = useCallback((message: string, attachments: { url: string; filename: string }[] = []) => {
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
            assistantMessage += event.data;
            setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage?.role === "model") {
                    lastMessage.parts = [{ text: assistantMessage }];
                    return [...newMessages];
                } else {
                    return [...newMessages, { role: "model", parts: [{ text: assistantMessage }] } as Message];
                }
            });
        };

        eventSource.addEventListener("error", (event) => {
            try {
                const data = JSON.parse((event as MessageEvent).data);
                if (data.error === "stream-failure") {
                    setStreamError(data.message || "Stream failed");
                }
            } catch { }
            eventSource.close();
            setGenerating(false);
        });

        eventSource.onerror = () => {
            eventSource.close();
            setGenerating(false);
            // Do not overwrite messages with server messages on error
        };

        eventSource.addEventListener("done", () => {
            eventSource.close();
            setGenerating(false);
            loadMessagesFromServer(tabId).then(r => {
                // If the last message is not a model, update from server
                if (!messages[messages.length - 1] || messages[messages.length - 1]?.role !== "model") {
                    setMessages(r.messages);
                }
                // Otherwise, keep the current state (preserve partial message)
            });
        });
    }, [tabId, setMessages, setGenerating, setStreamError, messages]);

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
            const bottomThreshold = messagesElement.scrollHeight - 35;

            if (currentScrollY < lastScrollY) {
                setAutoScroll(false);
            } else if (currentScrollY > lastScrollY) {
                if (scrollPosition >= bottomThreshold) {
                    const messagesElement = messagesRef.current;
                    if (messagesElement) {
                        programmaticScrollRef.current = true;
                        window.scrollTo({
                            behavior: "instant",
                            top: messagesElement.scrollHeight,
                        });
                        setTimeout(() => {
                            programmaticScrollRef.current = false;
                        }, 100);
                    }
                    setAutoScroll(true);
                }
            }
            lastScrollY = currentScrollY;
        }
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, [onSend, tabId]);

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

    // Regenerate handler for LLM responses
    const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
    const handleRegenerate = useCallback(async (idx: number) => {
        setRegeneratingIdx(idx);
        await fetch(`/api/chat/${tabId}/messages/delete-from-index?fromIndex=${idx}`, { method: "DELETE" });

        const prevUserMsg = messages[idx - 1];
        if (!prevUserMsg || (prevUserMsg?.role) !== "user") {
            setRegeneratingIdx(null);
            return;
        }

        const eventSource = new EventSource(`/api/chat/${tabId}/regenerate?fromIndex=${idx}`);
        let assistantMessage = "";
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            assistantMessage += data.candidates[0].content.parts[0].text;
            setMessages(prev => {
                const newMessages = prev.slice(0, idx);
                return [...newMessages, { role: "model", parts: [{ text: assistantMessage }] } as Message];
            });
        };
        eventSource.onerror = () => {
            eventSource.close();
            setRegeneratingIdx(null);
            loadMessagesFromServer(tabId).then((r) => setMessages(r.messages));
        };
        eventSource.addEventListener("done", () => {
            eventSource.close();
            setRegeneratingIdx(null);
            loadMessagesFromServer(tabId).then((r) => setMessages(r.messages));
        });
    }, [messages, tabId]);

    async function handleDeleteMessage(idx: number) {
        if (idx === 0) {
            // Delete the entire chat if the first message is deleted
            await fetch(`/api/chat/${tabId}`, { method: "DELETE" });
            // Redirect to home or another page after deletion
            window.location.href = "/";
            return;
        }
        await fetch(`/api/chat/${tabId}/messages/delete-from-index?fromIndex=${idx}`, { method: "DELETE" });
        setMessages(messages.slice(0, idx));
    }

    // Fetch chat info (model/provider) on mount
    useEffect(() => {
        if (!tabId) return;
        fetch(`/api/chat/${tabId}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.model && data.provider) {
                    setModel(data.model);
                    setProvider(data.provider);
                }
            })
            .catch(() => {
                setModel(null);
                setProvider(null);
            });
    }, [tabId]);

    useEffect(() => {
        fetch("/api/byok-required").then(res => res.json()).then(data => {
            setByokRequired(data.required);
            if (data.required) {
                window.location.href = "/settings";
            }
        });
    }, []);

    if (byokRequired) {
        return null;
    }

    return (
        <>
            {generating && autoScroll && (
                <button
                    onClick={handleStopAutoScroll}
                    className="z-50 top-18 backdrop-blur-2xl fixed left-1/2 -translate-x-1/2 w-fit bg-white/10 hover:bg-red-500/30 cursor-pointer text-white rounded-full p-3 py-1.5 shadow-lg transition-all flex items-center justify-center"
                    aria-label="Stop automatic scroll"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Stop automatic scroll
                </button>
            )}
            <div className="min-h-0 flex-1 w-full flex flex-col justify-between items-center py-6 gap-8">
                <div className="w-[80%] max-md:w-[90%] max-w-[1000px] max-h-full overflow-x-clip grid gap-2 grid-cols-[0.1fr_0.9fr]" ref={messagesRef}>
                    <div ref={topSentinelRef} style={{ height: 1 }} />
                    {!messagesLoading && (
                        <>
                            {messages.map((message, idx) => (
                                <MessageBubble
                                    key={`${message?.role}-${idx}`}
                                    message={message}
                                    index={idx}
                                    onDelete={handleDeleteMessage}
                                    onRegenerate={handleRegenerate}
                                    regeneratingIdx={regeneratingIdx}
                                />
                            ))}
                        </>
                    )}
                    {streamError && (
                        <div className="w-full flex flex-col items-center gap-2 mt-4">
                            <div className="text-red-500">Message generation failed. You can retry.</div>
                            <button
                                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
                                onClick={() => {
                                    setStreamError(null);
                                    if (messages.length > 1) handleRegenerate(messages.length - 1);
                                }}
                            >
                                Retry
                            </button>
                        </div>
                    )}
                    {generating && (!messages[messages.length - 1] || messages[messages.length - 1]?.role !== "model") && (
                        <div className="col-span-2 flex justify-start items-start py-8 group relative">
                            <span className="flex gap-1">
                                <span className="inline-block w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
                                <span className="inline-block w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                                <span className="inline-block w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                            </span>
                            <div className="absolute left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 bg-neutral-800 text-white text-xs rounded px-3 py-2 shadow-lg z-10 w-max max-w-xs">
                                Why is this showing? Latency, reasoning and uploading files
                            </div>
                            <style jsx>{`
                                @keyframes bounce {
                                    0%, 80%, 100% { transform: translateY(0); }
                                    40% { transform: translateY(-8px); }
                                }
                                .animate-bounce {
                                    animation: bounce 1s infinite;
                                }
                            `}</style>
                        </div>
                    )}
                </div>
                <ChatInput
                    onSend={onSend}
                    loading={generating}
                    className="w-[80%] max-md:w-[90%] max-w-[1000px] z-15"
                    model={model}
                    provider={provider}
                    isModelFixed
                />
            </div>
        </>
    );
}

const MessageBubble = ({ message, index, onDelete, onRegenerate, regeneratingIdx }: { message: Message, index: number, onDelete?: (idx: number) => void, onRegenerate?: (idx: number) => void, regeneratingIdx?: number | null }) => {
    const isUser = message?.role === "user";
    const className = isUser
        ? "px-6 py-4 rounded-2xl mb-1 bg-white/[0.06] justify-self-end"
        : "p-2 mb-1";

    const renderedMarkdown = useMemo(() => {
        // Only apply syntax highlighting for model messages
        const rehypePlugins = isUser
            ? [rehypeRaw, [rehypeClassAll, { className: "md" }]]
            : [rehypeRaw, rehypeHighlight, [rehypeClassAll, { className: "md" }]];

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

    // Trash icon fade in/out on hover (only for user messages)
    const [hovered, setHovered] = useState(false);
    const [pendingDelete, setPendingDelete] = useState(false);
    const [copied, setCopied] = useState(false);
    const deleteTimeout = useRef<NodeJS.Timeout | null>(null);
    const copyTimeout = useRef<NodeJS.Timeout | null>(null);

    // Reset pendingDelete if mouse leaves
    useEffect(() => {
        if (!hovered && pendingDelete) {
            deleteTimeout.current = setTimeout(() => setPendingDelete(false), 2000);
        } else if (hovered && deleteTimeout.current) {
            clearTimeout(deleteTimeout.current);
            deleteTimeout.current = null;
        }
    }, [hovered, pendingDelete]);

    // Clean up timeouts on unmount
    useEffect(() => () => {
        if (deleteTimeout.current) clearTimeout(deleteTimeout.current);
        if (copyTimeout.current) clearTimeout(copyTimeout.current);
    }, []);

    // Copy message handler
    const handleCopy = async () => {
        if (copied) return;
        const text = message.parts[0]?.text ?? "";
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            copyTimeout.current = setTimeout(() => setCopied(false), 3000);
        } catch { }
    };

    const params = useParams();
    const chatId = params.id?.toString() ?? "";
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
        <div
            className={`${isUser ? "justify-self-end col-start-2 " : "justify-self-start col-span-2"} max-w-full relative`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
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
            <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                {/* Copy button for all messages */}
                <button
                    aria-label={copied ? "Copied!" : "Copy message"}
                    onClick={handleCopy}
                    className={`relative transition-all duration-300 hover:text-neutral-50/75 text-neutral-50/50 rounded-full flex items-center justify-center z-10 ${copied ? "text-neutral-50" : ""}`}
                    style={{ opacity: hovered || copied ? 1 : 0, pointerEvents: hovered || copied ? 'auto' : 'none', width: 36, height: 36 }}
                >
                    <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: copied ? 'scale(0)' : 'scale(1)', zIndex: copied ? 0 : 1 }}>
                        {/* Copy SVG */}
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform duration-200">
                            <rect x="6" y="6" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                            <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: copied ? 'scale(1)' : 'scale(0)', zIndex: copied ? 1 : 0 }}>
                        {/* Checkmark SVG */}
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3.5 9.5208L7.63598 13.1296L14.5 4.87061" stroke="currentColor" strokeWidth="2.5" />
                        </svg>
                    </span>
                </button>
                {message?.role === "model" && onRegenerate && (
                    <button
                        aria-label="Regenerate response"
                        onClick={() => onRegenerate(index)}
                        className={`relative transition-all duration-300 hover:text-neutral-50/75 text-neutral-50/50 rounded-full flex items-center justify-center z-10 ${regeneratingIdx === index ? "animate-spin" : ""}`}
                        style={{ opacity: hovered || regeneratingIdx === index ? 1 : 0, pointerEvents: hovered || regeneratingIdx === index ? 'auto' : 'none', width: 36, height: 36 }}
                        disabled={regeneratingIdx === index}
                    >
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: 'scale(1)', zIndex: 1 }}>
                            {/* Regenerate SVG */}
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M15.1425 1.97778L15.0644 7.62329L9.41692 7.677L9.40032 5.927L12.7685 5.89575C11.101 4.3035 8.48511 4.07555 6.55071 5.47583C4.37106 7.05408 3.88366 10.1008 5.46184 12.2805C7.04012 14.4599 10.086 14.9473 12.2656 13.3694C12.8709 12.931 13.3441 12.3809 13.6796 11.7688L15.2148 12.6096C14.7572 13.4445 14.1118 14.1926 13.2919 14.7864C10.3295 16.9314 6.18904 16.2691 4.04387 13.3069C1.89907 10.3444 2.56195 6.20387 5.52434 4.05884C7.92652 2.31966 11.1029 2.42655 13.3622 4.10864L13.3925 1.95435L15.1425 1.97778Z" fill="currentColor" />
                            </svg>
                        </span>
                    </button>
                )}
                {/* Delete button for user messages only */}
                {isUser && onDelete && (
                    <button
                        aria-label={pendingDelete ? "Confirm delete message" : "Delete message"}
                        onClick={() => {
                            if (!pendingDelete) {
                                setPendingDelete(true);
                            } else {
                                setPendingDelete(false);
                                onDelete(index);
                            }
                        }}
                        className={`relative transition-all duration-300 hover:text-neutral-50/75 text-neutral-50/50 rounded-full flex items-center justify-center z-10 ${pendingDelete ? "!text-red-500" : ""}`}
                        style={{ opacity: hovered || pendingDelete ? 1 : 0, pointerEvents: hovered || pendingDelete ? 'auto' : 'none', width: 36, height: 36 }}
                    >
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: pendingDelete ? 'scale(0)' : 'scale(1)', zIndex: pendingDelete ? 0 : 1 }}>
                            {/* Trash SVG */}
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform duration-200">
                                <rect x="4.01562" y="1.95166" width="9.96755" height="1.88327" rx="0.941634" fill="currentColor" />
                                <path d="M12.9915 5.20386C13.5677 5.20391 14.0246 5.6903 13.9896 6.26538L13.4642 14.8933C13.4321 15.421 12.9949 15.8328 12.4662 15.8328H5.59311C5.06695 15.8326 4.63122 15.4242 4.59604 14.8992L4.01791 6.27124C3.97923 5.69402 4.4365 5.204 5.01498 5.20386H12.9915ZM11.2523 6.53979L10.888 14.7185L12.1292 14.6794L12.4945 6.50171L11.2523 6.53979ZM5.98471 14.6794H7.26693L6.90268 6.50171H5.61947L5.98471 14.6794ZM8.42025 14.6794H9.73764L9.73471 6.50171H8.41732L8.42025 14.6794Z" fill="currentColor" />
                            </svg>
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: pendingDelete ? 'scale(1)' : 'scale(0)', zIndex: pendingDelete ? 1 : 0 }}>
                            {/* Checkmark SVG */}
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3.5 9.5208L7.63598 13.1296L14.5 4.87061" stroke="currentColor" strokeWidth="2.5" />
                            </svg>
                        </span>
                    </button>
                )}
            </div>
        </div>
    );
}

