import { /* GeminiChat, OpenAIChat, */ Chat, OpenRouterChat } from "@/app/lib/types/ai";
import { SYSTEM_PROMPT } from "@/internal-lib/constants";
// import { AnthropicChat } from "../types/ai";

/**
 * Returns the correct Chat instance for the given provider and model.
 * Throws if provider is not supported.
 */
export function getChatClass(provider: string, model: string, history: any[], systemPrompt?: string, apiKey?: string): Chat {
    const prompt = systemPrompt || SYSTEM_PROMPT(model, provider, new Date().toISOString());
    switch (provider?.toLowerCase()) {
        // case "openai":
        //     return new OpenAIChat(history, model, prompt, apiKey);
        // case "google":
        //     return new GeminiChat(history, model, prompt, apiKey);
        // case "anthropic":
        //     return new AnthropicChat(history, model, prompt, apiKey);
        case "openrouter":
            return new OpenRouterChat(history, model, prompt, apiKey);
        default:
            throw new Error("Unsupported chat provider: " + provider);
    }
}
