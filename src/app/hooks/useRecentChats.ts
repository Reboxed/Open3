import { useEffect, useState } from "react";

export interface RecentChat {
  id: string;
  label?: string;
  firstResponse?: string;
}

export function useRecentChats(count: number = 4) {
  const [chats, setChats] = useState<RecentChat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchChats() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/chat?page=1&limit=${count}`, );
        const data = await res.json();
        if (!data.chats || !Array.isArray(data.chats)) {
          setChats([]);
          setIsLoading(false);
          return;
        }
        const chatResults: RecentChat[] = await Promise.all(
          data.chats.map(async (chat: any) => {
            let firstResponse = "";
            try {
              const msgRes = await fetch(`/api/chat/${chat.id}/messages`);
              const msgData = await msgRes.json();
              if (msgData.messages && Array.isArray(msgData.messages)) {
                const firstModelMsg = msgData.messages.find((m: any) => m.role === "model" && m.parts?.[0]?.text);
                firstResponse = firstModelMsg?.parts?.[0]?.text || "";
              }
            } catch {}
            return { id: chat.id, label: chat.label, firstResponse };
          })
        );
        setChats(chatResults);
      } catch { setChats([]) }
      setIsLoading(false);
    }
    fetchChats();
  }, [count]);

  return { chats, isLoading };
}
