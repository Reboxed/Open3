import { GeminiChat, OpenRouterChat } from "@/app/lib/types/ai";
import { OpenAIChat } from "@/app/lib/types/ai";
import { AnthropicChat } from "../types/ai";

export function getAllModelCapabilities() {
    return [
        // GeminiChat.getCapabilities(),
        // OpenAIChat.getCapabilities(),
        // AnthropicChat.getCapabilities(),
        OpenRouterChat.getCapabilities(),
    ].flat();
}
