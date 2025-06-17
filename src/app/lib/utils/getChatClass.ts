import { GeminiChat, OpenAIChat, Chat } from "@/app/lib/types/ai";
import { AnthropicChat } from "../types/ai";

/**
 * Returns the correct Chat instance for the given provider and model.
 * Throws if provider is not supported.
 */
export function getChatClass(provider: string, model: string, history: any[]): Chat {
    switch (provider?.toLowerCase()) {
        case "openai":
            return new OpenAIChat(history, model);
        case "google":
            return new GeminiChat(history, model);
        case "anthropic":
            return new AnthropicChat(history, model);
        default:
            throw new Error("Unsupported chat provider: " + provider);
    }
}
