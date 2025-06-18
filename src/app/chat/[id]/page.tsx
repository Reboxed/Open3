"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import ChatInput from "../../components/ChatInput";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css"; // Change to preferred style
import { Message } from "../../lib/types/ai";
import { escape } from "html-escaper";
import rehypeClassAll from "../../lib/utils/rehypeClassAll";
import { useParams } from "next/navigation";
import { loadMessagesFromServer } from "../../lib/utils/messageUtils";
import Image from "next/image";
import { Protect, SignedOut } from "@clerk/nextjs";

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

    const onSend = useCallback(async (message: string, attachments: { url: string; filename: string }[] = []) => {
        // Add user message optimistically to UI
        const userMessage: Message = { role: "user", parts: [{ text: message }], attachments: attachments.length > 0 ? attachments : undefined };
        setMessages(prev => [...prev, userMessage]);
        setGenerating(true);

        const response = await fetch(`/api/chat/${tabId}/send`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt: message,
                attachments: attachments.length > 0 ? attachments : undefined,
            }),
        }).catch(() => {
            setGenerating(false);
            setStreamError("Failed to send message");
            return;
        });

        if (!response || !response.ok) {
            setGenerating(false);
            setStreamError("Failed to send message");
            return;
        }
    }, [tabId]);

    // Regenerate handler for LLM responses
    const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
    const handleRegenerate = useCallback(async (idx: number) => {
        setRegeneratingIdx(idx);
        const deleteRes = await fetch(`/api/chat/${tabId}/messages/delete-from-index?fromIndex=${idx}`, { method: "DELETE" })
            .catch(() => {
                setRegeneratingIdx(null);
                setStreamError("Failed to delete message for regeneration");
                return;
            });
        if (!deleteRes || !deleteRes.ok) {
            setRegeneratingIdx(null);
            setStreamError("Failed to delete message for regeneration");
            return;
        }

        const prevUserMsg = messages[idx - 1];
        if (!prevUserMsg || (prevUserMsg?.role) !== "user") {
            setRegeneratingIdx(null);
            return;
        }

        const response = await fetch(`/api/chat/${tabId}/regenerate?fromIndex=${idx}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        }).catch(() => {
            setRegeneratingIdx(null);
            setStreamError("Failed to regenerate message");
            return;
        });

        if (!response || !response.ok) {
            setRegeneratingIdx(null);
            setStreamError("Failed to regenerate message");
            return;
        }

        // Now delete the messages after sending the request on the view
        setMessages(prev => {
            const newMessages = [...prev];
            newMessages.splice(idx, 1); // Remove the model message at idx
            return newMessages;
        });
    }, [messages, tabId]);

    useEffect(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        const eventSource = new EventSource(`/api/stream?` + new URLSearchParams({ chat: tabId }).toString());
        eventSourceRef.current = eventSource;

        const streamDoneEvent = (event: MessageEvent) => {
            assistantMessage = "";
            reloadMessagesFromServerIfStateInvalid();
            setGenerating(false);
            setRegeneratingIdx(null);
        }
        eventSource.addEventListener("stream-done", streamDoneEvent);

        const streamErrorEvent = (event: MessageEvent) => {
            assistantMessage = "";
            setStreamError(event.data || "An error occurred");
            setGenerating(false);
        }
        eventSource.addEventListener("stream-error", streamErrorEvent);

        let assistantMessage = "";
        eventSource.onmessage = (event) => {
            setGenerating(true);
            // Preserve newlines by replacing explicit \n or handling chunked data
            let chunk = event.data;
            // If your backend sends literal "\\n", replace with "\n"
            chunk = chunk.replace(/\\n/g, "\n");
            // If backend sends real newlines, this is not needed

            assistantMessage += chunk;
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
        }

        eventSource.addEventListener("error", (event) => {
            console.warn("EventSource error:", event);
            try {
                const data = JSON.parse((event as MessageEvent).data);
                if (data.error === "stream-failure") {
                    setStreamError(data.message || "Stream failed");
                }
            } catch { }
            eventSource.close();
            assistantMessage = "";
            setGenerating(false);
        }, { once: true });

        eventSource.addEventListener("done", () => {
            reloadMessagesFromServerIfStateInvalid();
            eventSource.close();
            assistantMessage = "";
            setGenerating(false);
        }, { once: true });

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.removeEventListener("stream-done", streamDoneEvent);
                eventSourceRef.current.removeEventListener("stream-error", streamErrorEvent);
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        }
    }, [tabId]);


    useEffect(() => {
        const tempNewMsg = sessionStorage.getItem("temp-new-tab-msg");
        if (tempNewMsg) {
            try {
                const parsedMsg = JSON.parse(tempNewMsg);
                if (parsedMsg.tabId === tabId) {
                    const waitUntilEventSource = new Promise<void>((resolve) => {
                        const checkEventSource = () => {
                            if (eventSourceRef.current) {
                                resolve();
                            } else {
                                setTimeout(checkEventSource, 50);
                            }
                        };
                        checkEventSource();
                    });
                    sessionStorage.removeItem("temp-new-tab-msg");
                    waitUntilEventSource.then(() => {
                        onSend(parsedMsg.message, parsedMsg.attachments || []);
                    });
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

    const reloadMessagesFromServerIfStateInvalid = useCallback(async () => {
        const serverMessages = await loadMessagesFromServer(tabId);
        if (!messages[messages.length - 1] || messages[messages.length - 1]?.role !== "model") {
            setMessages(serverMessages.messages);
        }
    }, [tabId, messages]);

    useEffect(() => {
        if (autoScroll) {
            setTimeout(() => {
                const event = new Event("scroll");
                window.dispatchEvent(event);
            }, 0);
        }
    }, [autoScroll]);

    function handleStopAutoScroll() {
        setAutoScroll(false);
    }

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
        fetch("/api/byok/required").then(res => res.json()).then(data => {
            setByokRequired(data.required);
            if (data.required) {
                window.location.href = "/settings";
            }
        });
    }, []);

    if (byokRequired) return null;

    return (
        <>
            <Protect>
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
                            <div className="col-span-2 w-full flex flex-col items-start gap-1 mt-4">
                                <span className="text-red-500">Message generation failed. You can retry.</span>
                                <span className="text-red-600">Reason: {streamError}</span>
                                <button
                                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition cursor-pointer mt-2"
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
                        generating={generating}
                        className="w-[80%] max-md:w-[90%] max-w-[1000px] z-15"
                        model={model}
                        provider={provider}
                        isModelFixed
                    />
                </div>
            </Protect>
            <SignedOut>
                <div className="min-w-full min-h-0 flex-1 flex flex-col justify-center items-center">
                    <div className="flex flex-col h-fit gap-2 w-[80%] max-w-[1000px] max-md:w-[90%]">
                        <h2 className="!mb-0.5">Please sign in to use Open3</h2>
                        <span className="mb-3 text-neutral-300">Inference is expensive, I couldn&apos;t manage to in-time make Open3 accessible to everyone with an additional paid plan in the time frame of the hackathon. But I am dedicated to refactoring this project after the hackathon, adding more features and bringing it online!</span>
                        <ChatInput
                            className={`w-full opacity-35 pointer-events-none overflow-clip`}
                            isModelFixed
                        />
                    </div>
                </div>
            </SignedOut>
        </>
    );
}

const PreWithCopy = ({ node, className, children, ...props }: any) => {
    let language = "";
    let codeText = "";
    // Find the code child and extract its className for language
    React.Children.forEach(children, child => {
        if (
            React.isValidElement(child) && child.type === "code" && typeof (child as any)?.props?.className === "string"
        ) {
            const match = (child as any)?.props?.className?.match(/language-(\w+)/);
            if (match) language = match[1];
            codeText = (child as any)?.props?.children ?? "";
        }
    });

    // Local state for copy feedback
    const [copiedCode, setCopiedCode] = useState(false);
    const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleCopyCode = async () => {
        if (copiedCode) return;
        
        // Not fast, not good, but it works
        // FIXME: This is a temporary solution to extract text from React children
        try {
            // Try to extract plain text from React children
            let textToCopy = "";
            if (typeof codeText === "string") {
                textToCopy = codeText;
            } else if (Array.isArray(codeText)) {
                // Recursively extract text from React children
                const extractText = (children: any): string => {
                    try {
                        if (typeof children === "string") return children;
                        if (Array.isArray(children)) return children.map(extractText).join("");
                        if (React.isValidElement(children) && (children.props as any)?.children)
                            return extractText((children.props as any).children);
                    } catch { }
                    return "";
                };
                textToCopy = extractText(codeText);
            } else if (React.isValidElement(codeText) && (children.props as any)?.children) {
                const extractText = (children: any): string => {
                    try {
                        if (typeof children === "string") return children;
                        if (Array.isArray(children)) return children.map(extractText).join("");
                        if (React.isValidElement(children) && (children.props as any)?.children)
                            return extractText((children.props as any).children);
                    } catch { }
                    return "";
                };
                textToCopy = extractText((children.props as any).children);
            }
            await navigator.clipboard.writeText(textToCopy);
            setCopiedCode(true);
            copyTimeoutRef.current = setTimeout(() => setCopiedCode(false), 2000);
        } catch { }
    };

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
    }, []);

    return (
        <div className="flex flex-col gap-2 max-w-full overflow-x-auto">
            <pre className={`${className} flex flex-col !p-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words`} style={{wordBreak: 'break-word', overflowX: 'auto'}}>
                <div className="bg-white/[0.07] w-full rounded-xl rounded-b-md py-2 px-4 flex gap-4 justify-between items-center">
                    <span className="text-sm font-mono">{language ? language[0].toUpperCase() + language.slice(1) : "Code"}</span>
                    <button
                        aria-label={copiedCode ? "Copied!" : "Copy code"}
                        onClick={handleCopyCode}
                        className={`relative transition-all duration-300 hover:text-neutral-50/75 !text-white rounded-full flex items-center justify-center z-10 cursor-pointer ${copiedCode ? "text-neutral-50" : ""}`}
                        style={{ width: 36, height: 36 }}
                    >
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: copiedCode ? "scale(0)" : "scale(1)", zIndex: copiedCode ? 0 : 1 }}>
                            {/* Copy SVG */}
                            <svg width="22" height="22" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform duration-200">
                                <rect x="6" y="6" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" />
                                <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" />
                            </svg>
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: copiedCode ? "scale(1)" : "scale(0)", zIndex: copiedCode ? 1 : 0 }}>
                            {/* Checkmark SVG */}
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3.5 9.5208L7.63598 13.1296L14.5 4.87061" stroke="currentColor" strokeWidth="1.5" />
                            </svg>
                        </span>
                    </button>
                </div>
                {children}
            </pre>
        </div>
    );
};

const MessageBubble = ({ message, index, onDelete, onRegenerate, regeneratingIdx }: { message: Message, index: number, onDelete?: (idx: number) => void, onRegenerate?: (idx: number) => void, regeneratingIdx?: number | null }) => {
    const isUser = message?.role === "user";
    const className = isUser
        ? "px-6 py-4 rounded-2xl mb-1 bg-white/[0.06] justify-self-end break-words max-w-full overflow-x-auto"
        : "p-2 mb-1 break-words max-w-full overflow-x-auto";

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
                components={{
                    pre: PreWithCopy
                }}
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
        const [imgSrc, setImgSrc] = useState(`/attachments/${chatId}/${encodeURIComponent(att.filename)}`);

        useEffect(() => {
            setImgSrc(`/attachments/${chatId}/${encodeURIComponent(att.filename)}`);
        }, [chatId, att.filename]);

        const handleImgError = useCallback(() => {
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
            <div className={`${className} max-w-full min-w-0`} style={{wordBreak: 'break-word', overflowX: 'auto'}}>
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
                    style={{ opacity: hovered || copied ? 1 : 0, pointerEvents: hovered || copied ? "auto" : "none", width: 36, height: 36 }}
                >
                    <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: copied ? "scale(0)" : "scale(1)", zIndex: copied ? 0 : 1 }}>
                        {/* Copy SVG */}
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform duration-200">
                            <rect x="6" y="6" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                            <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: copied ? "scale(1)" : "scale(0)", zIndex: copied ? 1 : 0 }}>
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
                        style={{ opacity: hovered || regeneratingIdx === index ? 1 : 0, pointerEvents: hovered || regeneratingIdx === index ? "auto" : "none", width: 36, height: 36 }}
                        disabled={regeneratingIdx === index}
                    >
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: "scale(1)", zIndex: 1 }}>
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
                        style={{ opacity: hovered || pendingDelete ? 1 : 0, pointerEvents: hovered || pendingDelete ? "auto" : "none", width: 36, height: 36 }}
                    >
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: pendingDelete ? "scale(0)" : "scale(1)", zIndex: pendingDelete ? 0 : 1 }}>
                            {/* Trash SVG */}
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform duration-200">
                                <rect x="4.01562" y="1.95166" width="9.96755" height="1.88327" rx="0.941634" fill="currentColor" />
                                <path d="M12.9915 5.20386C13.5677 5.20391 14.0246 5.6903 13.9896 6.26538L13.4642 14.8933C13.4321 15.421 12.9949 15.8328 12.4662 15.8328H5.59311C5.06695 15.8326 4.63122 15.4242 4.59604 14.8992L4.01791 6.27124C3.97923 5.69402 4.4365 5.204 5.01498 5.20386H12.9915ZM11.2523 6.53979L10.888 14.7185L12.1292 14.6794L12.4945 6.50171L11.2523 6.53979ZM5.98471 14.6794H7.26693L6.90268 6.50171H5.61947L5.98471 14.6794ZM8.42025 14.6794H9.73764L9.73471 6.50171H8.41732L8.42025 14.6794Z" fill="currentColor" />
                            </svg>
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200" style={{ transform: pendingDelete ? "scale(1)" : "scale(0)", zIndex: pendingDelete ? 1 : 0 }}>
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

