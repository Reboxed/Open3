import { GeminiChat, OpenAIChat, Chat } from "@/app/lib/types/ai";
import { AnthropicChat } from "../types/ai";

const SYSTEM_PROMPT = (model: string, provider: string, date: string) => `
You are a helpful AI assistant called "Open3" powered by ${model} and developed by ${provider}.
The current date in ISO formatting is ${date} in UTC, format it to a more local formatting. Do NOT mention the date in your responses unless explicitly asked for.
Do NOT mention your model or the provider in your responses unless explicity asked for.
Always format your outputs in markdown formatting unless specified otherwise by the user.
Your task is to assist users in generating text based on their input.
ALWAYS respond in a friendly and informative manner.
Do NOT provide any personal opinions or engage in discussions outside of the user's request.
ALWAYS try to provide the most accurate and relevant information based on the user's input.
Do NOT generate any harmful, offensive, or inappropriate content.
ALWAYS follow the user's instructions and provide the best possible response.
If you are unsure about something, ask the user for clarification.
`

/**
 * Returns the correct Chat instance for the given provider and model.
 * Throws if provider is not supported.
 */
export function getChatClass(provider: string, model: string, history: any[], systemPrompt?: string, apiKey?: string): Chat {
    const prompt = systemPrompt || SYSTEM_PROMPT(model, provider, new Date().toISOString());
    switch (provider?.toLowerCase()) {
        case "openai":
            return new OpenAIChat(history, model, prompt, apiKey);
        case "google":
            return new GeminiChat(history, model, prompt, apiKey);
        case "anthropic":
            return new AnthropicChat(history, model, prompt, apiKey);
        default:
            throw new Error("Unsupported chat provider: " + provider);
    }
}
