import React from "react";

export type ModelProviderValue = {
  model: string;
  provider: string;
} | undefined;

export const ModelProviderContext = React.createContext<ModelProviderValue>(undefined);

export function useModelProvider() {
  const ctx = React.useContext(ModelProviderContext);
  if (!ctx) throw new Error("ModelProviderContext not found");
  return ctx;
}
