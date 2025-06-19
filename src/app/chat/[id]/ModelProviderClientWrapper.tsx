"use client";
import React from "react";
import { ModelProviderContext } from "./ModelProviderContext";

export default function ModelProviderClientWrapper({ model, provider, children }: { model: string; provider: string; children: React.ReactNode }) {
  return (
    <ModelProviderContext.Provider value={{ model, provider }}>
      {children}
    </ModelProviderContext.Provider>
  );
}
