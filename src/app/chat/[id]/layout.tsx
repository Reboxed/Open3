"use client";
import React, { use, useEffect, useState } from "react";
import ModelProviderClientWrapper from "./ModelProviderClientWrapper";

// Default values
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const DEFAULT_PROVIDER = "openrouter";

export default function ChatLayout({ children, params }: {
  children: React.ReactNode,
  params: Promise<{ id: string }>,
}) {
  // Try to get previous values from localStorage (client only)
  const getInitialModel = () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lastModel") || DEFAULT_MODEL;
    }
    return DEFAULT_MODEL;
  };
  const getInitialProvider = () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lastProvider") || DEFAULT_PROVIDER;
    }
    return DEFAULT_PROVIDER;
  };

  const { id } = use(params);

  const [model, setModel] = useState(getInitialModel);
  const [provider, setProvider] = useState(getInitialProvider);

  useEffect(() => {
    async function fetchModelProvider(chatId: string) {
      try {
        const res = await fetch(`/api/chat/${chatId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.model) {
          setModel(data.model);
          localStorage.setItem("lastModel", data.model);
        }
        if (data.provider) {
          setProvider(data.provider);
          localStorage.setItem("lastProvider", data.provider);
        }
      } catch (e) {
        // Ignore errors, keep optimistic state
      }
    }
    fetchModelProvider(id);
  }, [id]);

  return (
    <ModelProviderClientWrapper model={model} provider={provider}>
      {children}
    </ModelProviderClientWrapper>
  );
}
