import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const AVAILABLE_PROVIDERS = ["google", "openai", "anthropic"];

export interface Message {
    role?: "user" | "model";
    parts: { 
        text?: string;
        inlineData?: {
            mimeType: string;
            data: string;
        };
    }[];
    attachments?: { url: string; filename: string }[];
}

export interface ModelCapabilities {
    model: string; // internal API name
    name: string;  // display name
    provider: string;
    supportsAttachments: boolean;
    supportsImages: boolean;
    supportsStreaming: boolean;
    description?: string;
}

export interface Chat {
    label?: string;
    model: string;
    provider: string;
    sendStream(message: Message): Promise<ReadableStream>;
    send(message: Message): Promise<string>;
    getHistory(): Message[];
    /**
     * Returns the capabilities for all supported models of this provider.
     */
    getCapabilities(): ModelCapabilities[];
}

export class GeminiChat implements Chat {
    model: string;
    provider: string = "google";
    label?: string;
    private ai: GoogleGenAI;
    private history: Message[] = [];

    constructor(history: Message[], model: string) {
        this.model = model;
        this.history = history;
        this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEN_AI_API_KEY })
    }

    async sendStream(message: Message): Promise<ReadableStream> {
        if (!message.parts[0] && (!message.attachments || message.attachments.length === 0)) {
            throw "at least one part or attachment is required";
        }

        const chat = this.ai.chats.create({
            model: this.model,
            history: this.history
        });

        this.history.push(message);

        // message.parts already contains all file data, so just use as-is
        const messageParts = [...message.parts];

        const result = await chat.sendMessageStream({
            message: messageParts,
        });

        const that = this;
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    let fullResponse = "";
                    for await (const chunk of result) {
                        const text = chunk.text;
                        fullResponse += text;
                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
                    }

                    that.history.push({
                        role: "model",
                        parts: [{
                            text: fullResponse,
                        }],
                    });

                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            },
        });
        return stream;
    }

    async send(message: Message): Promise<string> {
        // For now, just return the text part, but attachments are available in the message
        return message.parts[0]?.text ?? "";
    }

    getHistory(): Message[] {
        return this.history.map((msg) => ({
            role: msg.role,
            parts: msg.parts,
            attachments: msg.attachments,
        } as Message));
    }

    static getCapabilities(): ModelCapabilities[] {
        // Hard coded for now will be changed later
        return [
            {
                model: "gemini-1.5-flash-latest",
                name: "Gemini 2.5 Flash",
                provider: "google",
                supportsAttachments: true,
                supportsImages: false,
                supportsStreaming: true,
                description: "Fast, multimodal Gemini model. Supports file and image attachments."
            },
            {
                model: "gemini-1.5-pro-latest",
                name: "Gemini 2 Pro",
                provider: "google",
                supportsAttachments: true,
                supportsImages: false,
                supportsStreaming: true,
                description: "Pro version of Gemini, supports all features."
            }
        ];
    }
    getCapabilities(): ModelCapabilities[] {
        return GeminiChat.getCapabilities();
    }

    // Add a method to get the capabilities for the current chat's model
    getCurrentModelCapabilities(): ModelCapabilities | undefined {
        return GeminiChat.getCapabilities().find(c => c.model === this.model);
    }
}

export class OpenAIChat implements Chat {
    model: string;
    provider: string = "openai";
    label?: string;
    private history: Message[] = [];
    private openai: OpenAI;

    constructor(history: Message[], model: string) {
        this.model = model;
        this.history = history;
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY environment variable is required");
        }
    }

    // Helper to map internal roles to OpenAI roles
    private mapRole(role?: "user" | "model"): "user" | "assistant" {
        if (role === "model") return "assistant";
        return "user";
    }

    // Helper to convert message parts to OpenAI content format
    private convertPartsToOpenAIContent(parts: { text?: string; inlineData?: { mimeType: string; data: string } }[]) {
        const content: any[] = [];
        
        for (const part of parts) {
            if (part.text) {
                content.push({
                    type: "text",
                    text: part.text
                });
            } else if (part.inlineData) {
                // OpenAI supports images through vision API
                if (part.inlineData.mimeType.startsWith('image/')) {
                    content.push({
                        type: "image_url",
                        image_url: {
                            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                        }
                    });
                }
            }
        }
        
        // If no content, return just text
        return content.length > 0 ? content : [{ type: "text", text: "" }];
    }

    async sendStream(message: Message): Promise<ReadableStream> {
        if (!message.parts[0] && (!message.attachments || message.attachments.length === 0)) {
            throw "at least one part or attachment is required";
        }

        const messages = [
            ...this.history.map((msg) => ({
                role: this.mapRole(msg.role),
                content: this.convertPartsToOpenAIContent(msg.parts)
            })),
            {
                role: this.mapRole(message.role),
                content: this.convertPartsToOpenAIContent(message.parts)
            }
        ];

        const stream = await this.openai.chat.completions.create({
            model: this.model,
            messages,
            stream: true
        });

        const that = this;
        const readable = new ReadableStream({
            async start(controller) {
                let fullResponse = "";
                try {
                    for await (const chunk of stream) {
                        const text = chunk.choices?.[0]?.delta?.content || "";
                        fullResponse += text;
                        controller.enqueue(new TextEncoder().encode(text));
                    }
                    that.history.push({
                        role: "model",
                        parts: [{ text: fullResponse }],
                    });
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            }
        });
        return readable;
    }

    async send(message: Message): Promise<string> {
        const messages = [
            ...this.history.map((msg) => ({
                role: this.mapRole(msg.role),
                content: this.convertPartsToOpenAIContent(msg.parts)
            })),
            {
                role: this.mapRole(message.role),
                content: this.convertPartsToOpenAIContent(message.parts)
            }
        ];

        const response = await this.openai.chat.completions.create({
            model: this.model,
            messages
        });
        const text = response.choices?.[0]?.message?.content || "";
        this.history.push({
            role: "model",
            parts: [{ text }],
        });
        return text;
    }

    getHistory(): Message[] {
        return this.history.map((msg) => ({
            role: msg.role,
            parts: msg.parts,
            attachments: msg.attachments,
        } as Message));
    }

    static getCapabilities(): ModelCapabilities[] {
        // Hard coded for now will be changed later
        return [
            {
                model: "gpt-4.1-nano",
                name: "GPT-4.1 Nano",
                provider: "openai",
                supportsAttachments: true,
                supportsImages: false,
                supportsStreaming: true,
                description: "GPT-4.1 nano is the fastest, most cost-effective GPT-4.1 model. Supports file attachments."
            },
            {
                model: "gpt-4o",
                name: "GPT-4o",
                provider: "openai",
                supportsAttachments: true,
                supportsImages: true,
                supportsStreaming: true,
                description: "OpenAI GPT-4o, supports image input and file attachments."
            },
            {
                model: "gpt-4o-mini",
                name: "GPT-4o Mini",
                provider: "openai",
                supportsAttachments: true,
                supportsImages: true,
                supportsStreaming: true,
                description: "OpenAI GPT-4o Mini, cost-effective with vision and file support."
            }
        ];
    }
    getCapabilities(): ModelCapabilities[] {
        return OpenAIChat.getCapabilities();
    }

    getCurrentModelCapabilities(): ModelCapabilities | undefined {
        return OpenAIChat.getCapabilities().find(c => c.model === this.model);
    }
}

export class AnthropicChat implements Chat {
    model: string;
    provider: string = "anthropic";
    label?: string;
    private history: Message[] = [];
    private anthropic: Anthropic;

    constructor(history: Message[], model: string) {
        this.model = model;
        this.history = history;
        this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error("ANTHROPIC_API_KEY environment variable is required");
        }
    }

    private toAnthropicRole(role?: "user" | "model"): "user" | "assistant" {
        return role === "model" ? "assistant" : "user";
    }

    // Helper to convert message parts to Anthropic content format
    private convertPartsToAnthropicContent(parts: { text?: string; inlineData?: { mimeType: string; data: string } }[]) {
        const content: any[] = [];
        
        for (const part of parts) {
            if (part.text) {
                content.push({
                    type: "text",
                    text: part.text
                });
            } else if (part.inlineData) {
                // Anthropic supports images
                if (part.inlineData.mimeType.startsWith('image/')) {
                    content.push({
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: part.inlineData.mimeType,
                            data: part.inlineData.data
                        }
                    });
                }
            }
        }
        
        return content.length > 0 ? content : [{ type: "text", text: "" }];
    }

    async sendStream(message: Message): Promise<ReadableStream> {
        if (!message.parts[0] && (!message.attachments || message.attachments.length === 0)) {
            throw "at least one part or attachment is required";
        }
        
        const messages = [
            ...this.history.map((msg) => ({
                role: this.toAnthropicRole(msg.role),
                content: this.convertPartsToAnthropicContent(msg.parts)
            })),
            {
                role: this.toAnthropicRole(message.role),
                content: this.convertPartsToAnthropicContent(message.parts)
            }
        ];
        
        const stream = await this.anthropic.messages.create({
            model: this.model,
            messages,
            stream: true,
            max_tokens: 4096
        });
        const that = this;
        const readable = new ReadableStream({
            async start(controller) {
                let fullResponse = "";
                try {
                    for await (const event of stream) {
                        if (event.type === "content_block_delta" && event.delta && typeof event.delta === "object" && "text" in event.delta) {
                            const text = (event.delta as any).text;
                            if (typeof text === "string") {
                                fullResponse += text;
                                controller.enqueue(new TextEncoder().encode(text));
                            }
                        }
                    }
                    that.history.push({
                        role: "model",
                        parts: [{ text: fullResponse }],
                    });
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            }
        });
        return readable;
    }

    async send(message: Message): Promise<string> {
        const messages = [
            ...this.history.map((msg) => ({
                role: this.toAnthropicRole(msg.role),
                content: this.convertPartsToAnthropicContent(msg.parts)
            })),
            {
                role: this.toAnthropicRole(message.role),
                content: this.convertPartsToAnthropicContent(message.parts)
            }
        ];
        
        const response = await this.anthropic.messages.create({
            model: this.model,
            messages,
            max_tokens: 4096
        });
        
        // Find the first text block in the content array
        const text = Array.isArray(response.content)
            ? (response.content.find((block) => block.type === "text" && "text" in block)?.text || "")
            : "";
        
        this.history.push({
            role: "model",
            parts: [{ text }],
        });
        
        return text;
    }

    getHistory(): Message[] {
        return this.history.map((msg) => ({
            role: msg.role,
            parts: msg.parts,
            attachments: msg.attachments,
        } as Message));
    }

    static getCapabilities(): ModelCapabilities[] {
        // Hard coded for now, will be changed later
        return [
            {
                model: "claude-3-opus-20240229",
                name: "Claude Opus 3",
                provider: "anthropic",
                supportsAttachments: true,
                supportsImages: true,
                supportsStreaming: true,
                description: "Anthropic Claude 3 Opus"
            },
            {
                model: "claude-3-sonnet-20240229",
                name: "Claude Sonnet 3",
                provider: "anthropic",
                supportsAttachments: true,
                supportsImages: true,
                supportsStreaming: true,
                description: "Anthropic Claude 3 Sonnet"
            },
            {
                model: "claude-3-5-sonnet-20241022",
                name: "Claude Sonnet 3.5",
                provider: "anthropic",
                supportsAttachments: true,
                supportsImages: true,
                supportsStreaming: true,
                description: "Anthropic Claude 3.5 Sonnet"
            },
            {
                model: "claude-3-5-haiku-20241022",
                name: "Claude Haiku 3.5",
                provider: "anthropic",
                supportsAttachments: true,
                supportsImages: true,
                supportsStreaming: true,
                description: "Anthropic Claude 3.5 Haiku"
            },
            {
                model: "claude-opus-4-20250514",
                name: "Claude Opus 4",
                provider: "anthropic",
                supportsAttachments: true,
                supportsImages: true,
                supportsStreaming: true,
                description: "Anthropic Claude Opus 4"
            },
            {
                model: "claude-sonnet-4-20250514",
                name: "Claude Sonnet 4",
                provider: "anthropic",
                supportsAttachments: true,
                supportsImages: true,
                supportsStreaming: true,
                description: "Anthropic Claude Sonnet 4"
            },
        ];
    }
    getCapabilities(): ModelCapabilities[] {
        return AnthropicChat.getCapabilities();
    }
    getCurrentModelCapabilities(): ModelCapabilities | undefined {
        return AnthropicChat.getCapabilities().find(c => c.model === this.model);
    }
}
