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
import { loadMessagesFromServer, migrateMessagesFromLocalStorage } from "../lib/utils/messageUtils";

export default function Chat() {
    const params = useParams();
    const tabId = params.id?.toString() ?? "";

    const [messages, setMessages] = useState<Message[]>([]);
    const [offset, setOffset] = useState(0); // Offset from the end (0 = most recent)
    const [limit, setLimit] = useState(25);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const messagesRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [messagesLoading, setMessagesLoading] = useState(true);
    const eventSourceRef = useRef<EventSource | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const programmaticScrollRef = useRef(false);
    const [initialLoad, setInitialLoad] = useState(true);
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const [pageHistory, setPageHistory] = useState<number[]>([]); // Track loaded page offsets

    // Helper to load messages with pagination
    const fetchMessages = useCallback(async (newOffset = 0, append = false) => {
        setMessagesLoading(true);
        const serverMessages = await loadMessagesFromServer(tabId, newOffset, limit);
        setTotal(serverMessages.total);
        setOffset(serverMessages.offset);
        setLimit(serverMessages.limit);
        setHasMore(serverMessages.total > serverMessages.offset + serverMessages.messages.length);
        if (append) {
            setMessages(prev => [...serverMessages.messages, ...prev]);
            setPageHistory(prev => {
                const next = [...prev, newOffset];
                // Only keep the last 2 pages in memory
                return next.slice(-2);
            });
        } else {
            setMessages(serverMessages.messages);
            setPageHistory([newOffset]);
        }
        setIsLoading(serverMessages.generating);
        setMessagesLoading(false);
        setInitialLoad(false);
        return serverMessages;
    }, [tabId, limit]);

    // Load messages on mount/tabId change
    useEffect(() => {
        if (!tabId) return;
        setOffset(0);
        setInitialLoad(true);
        async function loadInitial() {
            await migrateMessagesFromLocalStorage(tabId);
            const serverMessages = await fetchMessages(0, false);
            // Auto-load more if viewport fits more than 25 messages
            setTimeout(() => {
                if (messagesRef.current && serverMessages.total > serverMessages.messages.length) {
                    const container = messagesRef.current;
                    if (container.scrollHeight <= window.innerHeight * 0.8) {
                        // Load more until filled or all loaded (with a buffer of 10)
                        let nextOffset = serverMessages.offset + serverMessages.messages.length;
                        const keepLoading = true;
                        (async function autoLoad() {
                            while (keepLoading && nextOffset < serverMessages.total) {
                                const more = await loadMessagesFromServer(tabId, nextOffset, limit);
                                setMessages(prev => [...more.messages, ...prev]);
                                setPageHistory(prev => {
                                    const next = [...prev, nextOffset];
                                    return next.slice(-2);
                                });
                                nextOffset += more.messages.length;
                                if (!messagesRef.current || more.messages.length === 0) break;
                                if (messagesRef.current.scrollHeight > window.innerHeight * 0.8 + 200) break;
                            }
                        })();
                    }
                }
            }, 100);
        }
        loadInitial();
    }, [tabId, fetchMessages, limit]);

    // Lazy load previous page when user scrolls to top
    useEffect(() => {
        if (!hasMore) return;
        const sentinel = topSentinelRef.current;
        if (!sentinel) return;
        const observer = new window.IntersectionObserver(async (entries) => {
            if (entries[0].isIntersecting && !messagesLoading && hasMore) {
                // Load previous page
                const newOffset = offset + messages.length;
                await fetchMessages(newOffset, true);
                // Unload last page if more than 2 pages in memory
                setMessages(prev => prev.slice(0, limit * 2));
            }
        }, { root: null, rootMargin: '0px', threshold: 1.0 });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [offset, messages, messagesLoading, hasMore, fetchMessages, limit]);

    // Auto-scroll when messages change
    useEffect(() => {
        if (!messagesLoading && messages.length > 0 && autoScroll) {
            const messagesElement = messagesRef.current;
            if (messagesElement) {
                programmaticScrollRef.current = true;
                window.scrollTo({
                    behavior: "smooth",
                    top: messagesElement.scrollHeight,
                });
                // Reset after scroll event fires
                setTimeout(() => {
                    programmaticScrollRef.current = false;
                }, 100);
            }
        }
    }, [messages, messagesLoading, autoScroll]);

    // Listen for user scroll to disable auto-scroll
    useEffect(() => {
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

            // If user scrolls up, always cancel auto-scroll
            if (currentScrollY < lastScrollY) {
                setAutoScroll(false);
            } else if (currentScrollY > lastScrollY) {
                // Only re-enable auto-scroll if user scrolls down and is near the bottom
                if (scrollPosition >= bottomThreshold) {
                    setAutoScroll(true);
                }
            }
            lastScrollY = currentScrollY;
        }
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // When auto-scroll is triggered programmatically, ignore the next scroll event
    useEffect(() => {
        if (autoScroll) {
            // Set a flag to ignore the next scroll event
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
        setIsLoading(true);

        // Save message to server
        fetch(`/api/chat/${tabId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage }),
        });

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

        eventSource.onerror = (error) => {
            eventSource.close();
            console.error(error);
            setIsLoading(false);
            //generateTitle();
            // Reload messages from server in case of error to sync state
            loadMessagesFromServer(tabId).then(r => setMessages(r.messages));
        };

        eventSource.addEventListener("done", () => {
            eventSource.close();
            setIsLoading(false);
            //generateTitle();
            // Reload messages from server to ensure we have the latest state
            loadMessagesFromServer(tabId).then(r => setMessages(r.messages));
        });
    }

    return (
        <div className="min-w-full min-h-full flex flex-col justify-between items-center py-6 gap-8">
            <div className="w-[80%] max-md:w-[90%] max-w-[1000px] max-h-full overflow-x-clip grid gap-4 grid-cols-[0.1fr_0.9fr]" ref={messagesRef}>
                <div ref={topSentinelRef} style={{ height: 1 }} />
                {messagesLoading && initialLoad ? (
                    <div className="col-span-2 flex justify-center items-center py-8">
                        <span className="text-neutral-400">Loading messages...</span>
                    </div>
                ) : (
                    <>
                        {/* No more Load more button! */}
                        {messages.map((message, idx) => (
                            <MessageBubble key={`${message.role}-${offset + idx}`} message={message} />
                        ))}
                    </>
                )}
                {/* Generating indicator: only show if isLoading is true and last message is not from model */}
                {isLoading && (!messages[messages.length-1] || messages[messages.length-1]?.role !== "model") && (
                    <div className="col-span-2 flex justify-center items-center py-8">
                        <span className="text-neutral-400">Generating...</span>
                    </div>
                )}
            </div>
            {isLoading && autoScroll && (
                <button
                    onClick={handleStopAutoScroll}
                    className="fixed bottom-6 right-6 z-50 bg-red-600 hover:bg-red-500 cursor-pointer text-white rounded-full p-3 shadow-lg transition-all flex items-center justify-center"
                    aria-label="Stop automatic scroll"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Stop automatic scroll
                </button>
            )}
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
            <ChatInput onSend={onSend} loading={isLoading} className="w-[80%] max-md:w-[90%] max-w-[min(80%,1000px)]" />
        </div>
    );
}

const MessageBubble = ({ message }: { message: Message }) => {
    const isUser = message.role === "user";
    const className = isUser
        ? "px-6 py-4 rounded-2xl bg-white/[0.06] mb-2 col-start-2 justify-self-end"
        : "p-2 mb-2 col-span-2";

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
                rehypePlugins={rehypePlugins as any}
                remarkPlugins={[remarkGfm]}
            >
                {isUser ? escape(message.parts[0].text) : message.parts[0].text}
            </Markdown>
        );
    }, [isUser, message.parts]);

    return (
        <div className={`${className} max-w-full min-w-0`}>
            {renderedMarkdown}
            {message.attachments && message.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                    {message.attachments.map(att => {
                        const isImage = /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(att.filename);
                        return isImage ? (
                            <a key={att.url} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                                <img src={att.url} alt={att.filename} className="max-h-32 max-w-xs rounded shadow border bg-white" style={{ display: 'inline-block' }} />
                                <div className="truncate text-xs text-center text-neutral-50/80">{att.filename}</div>
                            </a>
                        ) : (
                            <a key={att.url} href={att.url} target="_blank" rel="noopener noreferrer" className="underline text-blue-400 bg-black/10 rounded px-2 py-1 text-xs">
                                {att.filename}
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

MessageBubble.displayName = "MessageBubble";


