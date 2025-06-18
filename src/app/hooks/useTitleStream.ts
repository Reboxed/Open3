import { useEffect, useRef, useState } from "react";
import { NEW_TITLE_EVENT } from "@/internal-lib/constants";

export default function useTitleStream() {
    const [isConnected, setIsConnected] = useState(false);
    const [titles, setTitles] = useState(new Map<string, string>());
    const [error, setError] = useState<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 15;

    const connect = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        const eventSource = new EventSource(`/api/chat/title`);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            setIsConnected(true);
            setError(null);
            reconnectAttemptsRef.current = 0;
        };

        eventSource.addEventListener(NEW_TITLE_EVENT, (event) => {
            const chatId = event.data as string | null | undefined;
            if (!chatId) return;
            console.log("Received new title event:", chatId);
            setTitles((prev) => {
                const titlesCopy = new Map(prev);
                titlesCopy.set(chatId, "");
                return titlesCopy;
            });
        });

        eventSource.onmessage = (event) => {
            const data = event.data as string | null | undefined;
            console.log("Received title update:", data);

            const eventSplit = data?.split("::") || [];
            const chatId = eventSplit[0]?.trim();
            if (!chatId) {
                setError("Invalid message format received from server.");
                return;
            }

            const title = eventSplit.slice(1).join("::");
            if (title == undefined) {
                setError("Received empty title from server.");
                return;
            }
            
            setTitles((prev) => {
                const titlesCopy = new Map(prev);
                titlesCopy.set(chatId, title);
                return titlesCopy;
            });
        };

        eventSource.onerror = () => {
            setIsConnected(false);
            setError("Connection lost, attempting to reconnect...");
            eventSource.close();
            handleReconnect();
        };
    };

    const handleReconnect = () => {
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const retryTimeout = 350 * Math.pow(2, reconnectAttemptsRef.current); 
            setTimeout(() => {
                reconnectAttemptsRef.current += 1;
                connect();
            }, retryTimeout);
        } else {
            setError("Maximum reconnect attempts reached.");
        }
    };

    useEffect(() => {
        connect();
        return () => { eventSourceRef.current?.close() };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { isConnected, titles, error };
};

