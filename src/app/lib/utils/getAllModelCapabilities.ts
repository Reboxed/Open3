import { OpenRouterChat } from "@/app/lib/types/ai";

export function getAllModelCapabilities() {
    // return [
    //     // GeminiChat.getCapabilities(),
    //     // OpenAIChat.getCapabilities(),
    //     // AnthropicChat.getCapabilities(),
    //     OpenRouterChat.getCapabilities(),
    // ].flat()
    return OpenRouterChat.getCapabilities();
}
