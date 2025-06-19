import React from "react";
import { cookies } from "next/headers";
import ModelProviderClientWrapper from "./ModelProviderClientWrapper";

// Helper to fetch model/provider on the server
async function fetchModelProvider(chatId: string) {
  // You may need to pass cookies/headers for auth if required
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}/api/chat/${chatId}`,
    { headers: { Cookie: cookies().toString() } }
  );
  if (!res.ok) return { model: null, provider: null };
  const data = await res.json();
  return {
    model: data.model || null,
    provider: data.provider || null,
  };
}

export default async function ChatLayout({ children, params }: { children: React.ReactNode, params: { id: string } }) {
  const { model, provider } = await fetchModelProvider(params.id);

  if (!model || !provider) {
    return (
      <div className="w-full h-full flex items-center justify-center min-h-[200px]">
        <span className="text-neutral-400 animate-pulse text-lg">Loading chat...</span>
      </div>
    );
  }

  return (
    <ModelProviderClientWrapper model={model} provider={provider}>
      {children}
    </ModelProviderClientWrapper>
  );
}
