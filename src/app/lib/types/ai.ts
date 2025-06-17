import { OpenAI } from "openai";

// TODO: This should all be moved prooobabbllyyy and adding a model in the future should be as easy as being an admin on the 
// TODO: Open3 site and just adding it in a GUI.

export const AVAILABLE_PROVIDERS = ["google", "openai", "anthropic", "openrouter"];

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
    developer: string;
    supportsAttachmentsImages?: boolean;
    supportsAttachmentsPDFs?: boolean;
    supportsImageGen?: boolean;
    description?: string;
}

export interface Chat {
    label?: string;
    model: string;
    systemPrompt?: string;
    provider: string;
    sendStream(message: Message, maxCompletionTokens?: number): Promise<ReadableStream>;
    send(message: Message, maxCompletionTokens?: number): Promise<string>;
    getHistory(): Message[];
    getCapabilities(): Map<string, ModelCapabilities>;
    getCurrentModelCapabilities(): ModelCapabilities | undefined;
}

export class OpenRouterChat implements Chat {
    model: string;
    provider: string = "openrouter";
    label?: string;
    systemPrompt?: string;
    private history: Message[] = [];
    private openai: OpenAI | null = null;

    constructor(history: Message[], model: string, systemPrompt?: string, apiKey?: string) {
        this.model = model;
        this.history = history;
        this.systemPrompt = systemPrompt;
        this.provider = "openrouter";
        if (apiKey) {
            this.openai = new OpenAI({
                apiKey: apiKey,
                baseURL: "https://openrouter.ai/api/v1"
            });
            if (!apiKey) {
                throw new Error("No API key provider");
            }
        }
    }

    private mapRole(role?: "user" | "model"): "user" | "assistant" {
        if (role === "model") return "assistant";
        return "user";
    }

    private convertPartsToOpenAIContent(parts: { text?: string; inlineData?: { mimeType: string; data: string } }[], allowImages: boolean, allowPDFs: boolean) {
        const content: any[] = [];
        for (const part of parts) {
            if (part.text) {
                content.push({
                    type: "text",
                    text: part.text
                });
            } else if (part.inlineData) {
                if (allowImages && part.inlineData.mimeType.startsWith("image/")) {
                    content.push({
                        type: "image_url",
                        image_url: {
                            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                        }
                    });
                } else if (allowPDFs && part.inlineData.mimeType === "application/pdf") {
                    content.push({
                        type: "file",
                        file: {
                            mimeType: part.inlineData.mimeType,
                            data: part.inlineData.data
                        }
                    });
                }
            }
        }
        return content.length > 0 ? content : [{ type: "text", text: "" }];
    }

    private filterParts(parts: { text?: string; inlineData?: { mimeType: string; data: string } }[], allowImages: boolean, allowPDFs: boolean) {
        return parts.filter(part => {
            if (part.text) return true;
            if (part.inlineData) {
                if (allowImages && part.inlineData.mimeType.startsWith("image/")) return true;
                if (allowPDFs && part.inlineData.mimeType === "application/pdf") return true;
                return false;
            }
            return false;
        });
    }

    async sendStream(message: Message, maxCompletionTokens?: number): Promise<ReadableStream> {
        if (!this.openai) {
            throw new Error("OpenAI client is not initialized. Please provide an API key.");
        }

        if (!message.parts[0] && (!message.attachments || message.attachments.length === 0)) {
            throw "at least one part or attachment is required";
        }
        const caps = this.getCurrentModelCapabilities();
        const allowImages = !!caps?.supportsAttachmentsImages;
        const allowPDFs = !!caps?.supportsAttachmentsPDFs;
        const filteredHistory = this.history.map((msg) => ({
            ...msg,
            parts: this.filterParts(msg.parts, allowImages, allowPDFs)
        }));
        const filteredMessage = {
            ...message,
            parts: this.filterParts(message.parts, allowImages, allowPDFs)
        };
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            ...filteredHistory.map((msg) => ({
                role: this.mapRole(msg.role),
                content: this.convertPartsToOpenAIContent(msg.parts, allowImages, allowPDFs)
            })), {
                role: this.mapRole(filteredMessage.role),
                content: this.convertPartsToOpenAIContent(filteredMessage.parts, allowImages, allowPDFs)
            }
        ];
        if (this.systemPrompt) {
            messages.push({
                role: "system",
                content: this.systemPrompt
            });
        }
        const stream = await this.openai.chat.completions.create({
            model: this.model,
            messages,
            stream: true,
            max_completion_tokens: maxCompletionTokens,
        });
        const readableStreamOpenAI = stream.toReadableStream();
        if (!readableStreamOpenAI) {
            throw new Error("Failed to create readable stream from OpenAI response");
        }

        const that = this;
        const readable = new ReadableStream({
            async start(controller) {
                let fullResponse = "";
                try {
                    const reader = readableStreamOpenAI.getReader();
                    const decoder = new TextDecoder();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const jsonString = decoder.decode(value, { stream: true });
                        const json = JSON.parse(jsonString);
                        const text = json.choices?.[0]?.delta?.content || "";
                        fullResponse += text;
                        controller.enqueue(new TextEncoder().encode("data: " + text + "\n\n"));
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

    async send(message: Message, maxCompletionTokens?: number): Promise<string> {
        if (!this.openai) {
            throw new Error("OpenAI client is not initialized. Please provide an API key.");
        }
        
        const caps = this.getCurrentModelCapabilities();
        const allowImages = !!caps?.supportsAttachmentsImages;
        const allowPDFs = !!caps?.supportsAttachmentsPDFs;
        const filteredHistory = this.history.map((msg) => ({
            ...msg,
            parts: this.filterParts(msg.parts, allowImages, allowPDFs)
        }));
        const filteredMessage = {
            ...message,
            parts: this.filterParts(message.parts, allowImages, allowPDFs)
        };
        const messages = [
            ...filteredHistory.map((msg) => ({
                role: this.mapRole(msg.role),
                content: this.convertPartsToOpenAIContent(msg.parts, allowImages, allowPDFs)
            })),
            {
                role: this.mapRole(filteredMessage.role),
                content: this.convertPartsToOpenAIContent(filteredMessage.parts, allowImages, allowPDFs)
            }
        ];
        const response = await this.openai.chat.completions.create({
            model: this.model,
            messages,
            max_completion_tokens: maxCompletionTokens,
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

    static getCapabilities(): Map<string, ModelCapabilities> {
        return new Map<string, ModelCapabilities>([
            ["anthropic/claude-3.5-sonnet", {
                model: "anthropic/claude-3.5-sonnet",
                name: "Claude Sonnet 3.5",
                provider: "openrouter",
                developer: "Anthropic",
                supportsAttachmentsImages: true,
                supportsAttachmentsPDFs: true,
            }],
            ["anthropic/claude-opus-4", {
                model: "anthropic/claude-opus-4",
                name: "Claude Opus 4",
                provider: "openrouter",
                developer: "Anthropic",
                supportsAttachmentsImages: true,
                supportsAttachmentsPDFs: true,
            }],
            ["anthropic/claude-sonnet-4", {
                model: "anthropic/claude-sonnet-4",
                name: "Claude Sonnet 4",
                provider: "openrouter",
                developer: "Anthropic",
                supportsAttachmentsImages: true,
                supportsAttachmentsPDFs: true,
            }],
            ["openai/o4-mini", {
                model: "openai/o4-mini",
                name: "GPT-o4 mini",
                provider: "openrouter",
                developer: "OpenAI",
                supportsAttachmentsImages: true,
            }],
            ["openai/o4-mini-high", {
                model: "openai/o4-mini-high",
                name: "GPT-o4 mini (high)",
                provider: "openrouter",
                developer: "OpenAI",
                supportsAttachmentsImages: true,
            }],
            ["openai/o3-mini", {
                model: "openai/o3-mini",
                name: "GPT-o3 mini",
                provider: "openrouter",
                developer: "OpenAI",
            }],
            ["openai/o3-mini-high", {
                model: "openai/o3-mini-high",
                name: "GPT-o3 mini (high)",
                provider: "openrouter",
                developer: "OpenAI",
            }],
            ["openai/gpt-4.1", {
                model: "openai/gpt-4.1",
                name: "GPT-4.1",
                provider: "openrouter",
                developer: "OpenAI",
                supportsAttachmentsImages: true,
            }],
            ["openai/gpt-4.1-mini", {
                model: "openai/gpt-4.1-mini",
                name: "GPT-4.1 Mini",
                provider: "openrouter",
                developer: "OpenAI",
                supportsAttachmentsImages: true,
            }],
            ["openai/gpt-4.1-nano", {
                model: "openai/gpt-4.1-nano",
                name: "GPT-4.1 Nano",
                provider: "openrouter",
                developer: "OpenAI",
                supportsAttachmentsImages: true,
            }],
            ["openai/chatgpt-4o-latest", {
                model: "openai/chatgpt-4o-latest",
                name: "GPT-4o",
                provider: "openrouter",
                developer: "OpenAI",
                supportsAttachmentsImages: true,
            }],
            ["openai/gpt-4o-mini", {
                model: "openai/gpt-4o-mini",
                name: "GPT-4o Mini",
                provider: "openrouter",
                developer: "OpenAI",
                supportsAttachmentsImages: true,
            }],
            ["google/gemini-2.0-flash-001", {
                model: "google/gemini-2.0-flash-001",
                name: "Gemini 2.0 Flash",
                provider: "openrouter",
                developer: "Google",
                supportsAttachmentsImages: true,
                supportsAttachmentsPDFs: true,
            }],
            ["google/gemini-2.5-flash", {
                model: "google/gemini-2.5-flash",
                name: "Gemini 2.5 Flash",
                provider: "openrouter",
                developer: "Google",
                supportsAttachmentsImages: true,
                supportsAttachmentsPDFs: true,
            }],
            ["google/gemini-flash-1.5", {
                model: "google/gemini-flash-1.5",
                name: "Gemini 1.5 Flash",
                provider: "openrouter",
                developer: "Google",
                supportsAttachmentsImages: true,
                supportsAttachmentsPDFs: true,
            }],
            ["google/gemini-pro-1.5", {
                model: "google/gemini-pro-1.5",
                name: "Gemini 1.5 Pro",
                provider: "openrouter",
                developer: "Google",
                supportsAttachmentsImages: true,
                supportsAttachmentsPDFs: true,
            }],
            ["google/gemini-2.5-pro", {
                model: "google/gemini-2.5-pro",
                name: "Gemini 2.5 Pro",
                provider: "openrouter",
                developer: "Google",
                supportsAttachmentsImages: true,
                supportsAttachmentsPDFs: true,
            }],
        ]);
    }

    getCapabilities(): Map<string, ModelCapabilities> {
        return OpenRouterChat.getCapabilities();
    }

    getCurrentModelCapabilities(): ModelCapabilities | undefined {
        return OpenRouterChat.getCapabilities().get(this.model);
    }
}

// export class GeminiChat implements Chat {
//     model: string;
//     provider: string = "google";
//     label?: string;
//     systemPrompt?: string;
//     private ai: GoogleGenAI;
//     private history: Message[] = [];

//     constructor(history: Message[], model: string, systemPrompt?: string, apiKey?: string) {
//         this.model = model;
//         this.systemPrompt = systemPrompt;
//         this.history = history;
//         this.ai = new GoogleGenAI({ apiKey: apiKey || process.env.GOOGLE_GEN_AI_API_KEY })
//     }

//     async sendStream(message: Message): Promise<ReadableStream> {
//         if (!message.parts[0] && (!message.attachments || message.attachments.length === 0)) {
//             throw "at least one part or attachment is required";
//         }

//         const chat = this.ai.chats.create({
//             model: this.model,
//             history: this.history
//         });

//         this.history.push(message);

//         // message.parts already contains all file data, so just use as-is
//         const messageParts = [...message.parts];

//         const result = await chat.sendMessageStream({
//             message: messageParts,
//             config: {
//                 systemInstruction: this.systemPrompt,
//             }
//         });

//         const that = this;
//         const stream = new ReadableStream({
//             async start(controller) {
//                 try {
//                     let fullResponse = "";
//                     for await (const chunk of result) {
//                         const text = chunk.text;
//                         fullResponse += text;
//                         controller.enqueue(new TextEncoder().encode(`data: ${text}\n\n`));
//                     }

//                     that.history.push({
//                         role: "model",
//                         parts: [{
//                             text: fullResponse,
//                         }],
//                     });

//                     controller.close();
//                 } catch (error) {
//                     controller.error(error);
//                 }
//             },
//         });
//         return stream;
//     }

//     async send(message: Message): Promise<string> {
//         // For now, just return the text part, but attachments are available in the message
//         return message.parts[0]?.text ?? "";
//     }

//     getHistory(): Message[] {
//         return this.history.map((msg) => ({
//             role: msg.role,
//             parts: msg.parts,
//             attachments: msg.attachments,
//         } as Message));
//     }

//     static getCapabilities(): ModelCapabilities[] {
//         // Hard coded for now will be changed later
//         return [
//             {
//                 model: "gemini-2.0-flash",
//                 openRouterModel: "google/gemini-2.0-flash-001",
//                 name: "Gemini 2.0 Flash",
//                 provider: "google",
//                 supportsAttachments: true,
//                 supportsImages: false,
//                 supportsStreaming: true,
//                 description: "Fast, multimodal Gemini model. Supports file and image attachments."
//             },
//             {
//                 model: "gemini-1.5-flash",
//                 openRouterModel: "google/gemini-flash-1.5",
//                 name: "Gemini 1.5 Flash",
//                 provider: "google",
//                 supportsAttachments: true,
//                 supportsImages: false,
//                 supportsStreaming: true,
//                 description: "Fast, multimodal Gemini model. Supports file and image attachments."
//             },
//             {
//                 model: "gemini-1.5-pro",
//                 openRouterModel: "google/gemini-pro-1.5",
//                 name: "Gemini 1.5 Pro",
//                 provider: "google",
//                 supportsAttachments: true,
//                 supportsImages: false,
//                 supportsStreaming: true,
//                 description: "Pro version of Gemini, supports all features."
//             }
//         ];
//     }
//     getCapabilities(): ModelCapabilities[] {
//         return GeminiChat.getCapabilities();
//     }

//     // Add a method to get the capabilities for the current chat"s model
//     getCurrentModelCapabilities(): ModelCapabilities | undefined {
//         return GeminiChat.getCapabilities().find(c => c.model === this.model);
//     }
// }

// export class OpenAIChat implements Chat {
//     model: string;
//     provider: string = "openai";
//     label?: string;
//     systemPrompt?: string;
//     private history: Message[] = [];
//     private openai: OpenAI;

//     constructor(history: Message[], model: string, systemPrompt?: string, apiKey?: string) {
//         this.model = model;
//         this.history = history;
//         this.systemPrompt = systemPrompt;
//         this.openai = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
//         if (!apiKey && !process.env.OPENAI_API_KEY) {
//             throw new Error("OPENAI_API_KEY environment variable is required");
//         }
//     }

//     // Helper to map internal roles to OpenAI roles
//     private mapRole(role?: "user" | "model"): "user" | "assistant" {
//         if (role === "model") return "assistant";
//         return "user";
//     }

//     // Helper to convert message parts to OpenAI content format
//     private convertPartsToOpenAIContent(parts: { text?: string; inlineData?: { mimeType: string; data: string } }[]) {
//         const content: any[] = [];

//         for (const part of parts) {
//             if (part.text) {
//                 content.push({
//                     type: "text",
//                     text: part.text
//                 });
//             } else if (part.inlineData) {
//                 // OpenAI supports images through vision API
//                 if (part.inlineData.mimeType.startsWith("image/")) {
//                     content.push({
//                         type: "image_url",
//                         image_url: {
//                             url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
//                         }
//                     });
//                 }
//             }
//         }

//         // If no content, return just text
//         return content.length > 0 ? content : [{ type: "text", text: "" }];
//     }

//     async sendStream(message: Message): Promise<ReadableStream> {
//         if (!message.parts[0] && (!message.attachments || message.attachments.length === 0)) {
//             throw "at least one part or attachment is required";
//         }

//         const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
//             ...this.history.map((msg) => ({
//                 role: this.mapRole(msg.role),
//                 content: this.convertPartsToOpenAIContent(msg.parts)
//             })), {
//                 role: this.mapRole(message.role),
//                 content: this.convertPartsToOpenAIContent(message.parts)
//             }
//         ];
//         if (this.systemPrompt) {
//             messages.push({
//                 role: "system",
//                 content: this.systemPrompt
//             });
//         }

//         const stream = await this.openai.chat.completions.create({
//             model: this.model,
//             messages,
//             stream: true
//         });

//         const that = this;
//         const readable = new ReadableStream({
//             async start(controller) {
//                 let fullResponse = "";
//                 try {
//                     for await (const chunk of stream) {
//                         const text = chunk.choices?.[0]?.delta?.content || "";
//                         fullResponse += text;
//                         controller.enqueue(new TextEncoder().encode(text));
//                     }
//                     that.history.push({
//                         role: "model",
//                         parts: [{ text: fullResponse }],
//                     });
//                     controller.close();
//                 } catch (error) {
//                     controller.error(error);
//                 }
//             }
//         });
//         return readable;
//     }

//     async send(message: Message): Promise<string> {
//         const messages = [
//             ...this.history.map((msg) => ({
//                 role: this.mapRole(msg.role),
//                 content: this.convertPartsToOpenAIContent(msg.parts)
//             })),
//             {
//                 role: this.mapRole(message.role),
//                 content: this.convertPartsToOpenAIContent(message.parts)
//             }
//         ];

//         const response = await this.openai.chat.completions.create({
//             model: this.model,
//             messages
//         });
//         const text = response.choices?.[0]?.message?.content || "";
//         this.history.push({
//             role: "model",
//             parts: [{ text }],
//         });
//         return text;
//     }

//     getHistory(): Message[] {
//         return this.history.map((msg) => ({
//             role: msg.role,
//             parts: msg.parts,
//             attachments: msg.attachments,
//         } as Message));
//     }

//     static getCapabilities(): ModelCapabilities[] {
//         // Hard coded for now will be changed later
//         return [
//             {
//                 model: "gpt-4.1-nano",
//                 openRouterModel: "openai/gpt-4.1-nano",
//                 name: "GPT-4.1 Nano",
//                 provider: "openai",
//                 supportsAttachments: true,
//                 supportsImages: false,
//                 supportsStreaming: true,
//                 description: "GPT-4.1 nano is the fastest, most cost-effective GPT-4.1 model. Supports file attachments."
//             },
//             {
//                 model: "gpt-4o",
//                 openRouterModel: "openai/chatgpt-4o-latest",
//                 name: "GPT-4o",
//                 provider: "openai",
//                 supportsAttachments: true,
//                 supportsImages: true,
//                 supportsStreaming: true,
//                 description: "OpenAI GPT-4o, supports image input and file attachments."
//             },
//             {
//                 model: "gpt-4o-mini",
//                 openRouterModel: "openai/gpt-4o-mini",
//                 name: "GPT-4o Mini",
//                 provider: "openai",
//                 supportsAttachments: true,
//                 supportsImages: true,
//                 supportsStreaming: true,
//                 description: "OpenAI GPT-4o Mini, cost-effective with vision and file support."
//             }
//         ];
//     }
//     getCapabilities(): ModelCapabilities[] {
//         return OpenAIChat.getCapabilities();
//     }

//     getCurrentModelCapabilities(): ModelCapabilities | undefined {
//         return OpenAIChat.getCapabilities().find(c => c.model === this.model);
//     }
// }

// export class AnthropicChat implements Chat {
//     model: string;
//     provider: string = "anthropic";
//     label?: string;
//     systemPrompt?: string;
//     private history: Message[] = [];
//     private anthropic: Anthropic;

//     constructor(history: Message[], model: string, systemPrompt?: string, apiKey?: string) {
//         this.model = model;
//         this.history = history;
//         this.systemPrompt = systemPrompt;
//         this.anthropic = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
//         if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
//             throw new Error("ANTHROPIC_API_KEY environment variable is required");
//         }
//     }

//     private toAnthropicRole(role?: "user" | "model"): "user" | "assistant" {
//         return role === "model" ? "assistant" : "user";
//     }

//     // Helper to convert message parts to Anthropic content format
//     private convertPartsToAnthropicContent(parts: { text?: string; inlineData?: { mimeType: string; data: string } }[]) {
//         const content: any[] = [];

//         for (const part of parts) {
//             if (part.text) {
//                 content.push({
//                     type: "text",
//                     text: part.text
//                 });
//             } else if (part.inlineData) {
//                 // Anthropic supports images
//                 if (part.inlineData.mimeType.startsWith("image/")) {
//                     content.push({
//                         type: "image",
//                         source: {
//                             type: "base64",
//                             media_type: part.inlineData.mimeType,
//                             data: part.inlineData.data
//                         }
//                     });
//                 }
//             }
//         }

//         return content.length > 0 ? content : [{ type: "text", text: "" }];
//     }

//     async sendStream(message: Message): Promise<ReadableStream> {
//         if (!message.parts[0] && (!message.attachments || message.attachments.length === 0)) {
//             throw "at least one part or attachment is required";
//         }

//         const messages: Anthropic.Messages.MessageParam[] = [
//             ...this.history.map((msg) => ({
//                 role: this.toAnthropicRole(msg.role),
//                 content: this.convertPartsToAnthropicContent(msg.parts)
//             })),
//             {
//                 role: this.toAnthropicRole(message.role),
//                 content: this.convertPartsToAnthropicContent(message.parts)
//             }
//         ];

//         const stream = await this.anthropic.messages.create({
//             model: this.model,
//             messages,
//             system: this.systemPrompt,
//             stream: true,
//             max_tokens: 4096
//         });
//         const that = this;
//         const readable = new ReadableStream({
//             async start(controller) {
//                 let fullResponse = "";
//                 try {
//                     for await (const event of stream) {
//                         if (event.type === "content_block_delta" && event.delta && typeof event.delta === "object" && "text" in event.delta) {
//                             const text = (event.delta as any).text;
//                             if (typeof text === "string") {
//                                 fullResponse += text;
//                                 controller.enqueue(new TextEncoder().encode(text));
//                             }
//                         }
//                     }
//                     that.history.push({
//                         role: "model",
//                         parts: [{ text: fullResponse }],
//                     });
//                     controller.close();
//                 } catch (error) {
//                     controller.error(error);
//                 }
//             }
//         });
//         return readable;
//     }

//     async send(message: Message): Promise<string> {
//         const messages = [
//             ...this.history.map((msg) => ({
//                 role: this.toAnthropicRole(msg.role),
//                 content: this.convertPartsToAnthropicContent(msg.parts)
//             })),
//             {
//                 role: this.toAnthropicRole(message.role),
//                 content: this.convertPartsToAnthropicContent(message.parts)
//             }
//         ];

//         const response = await this.anthropic.messages.create({
//             model: this.model,
//             messages,
//             max_tokens: 4096
//         });

//         // Find the first text block in the content array
//         const text = Array.isArray(response.content)
//             ? (response.content.find((block) => block.type === "text" && "text" in block)?.text || "")
//             : "";

//         this.history.push({
//             role: "model",
//             parts: [{ text }],
//         });

//         return text;
//     }

//     getHistory(): Message[] {
//         return this.history.map((msg) => ({
//             role: msg.role,
//             parts: msg.parts,
//             attachments: msg.attachments,
//         } as Message));
//     }

//     static getCapabilities(): ModelCapabilities[] {
//         // Hard coded for now, will be changed later
//         return [
//             {
//                 model: "claude-3-5-sonnet-20241022",
//                 openRouterModel: "anthropic/claude-3.5-sonnet",
//                 name: "Claude Sonnet 3.5",
//                 provider: "anthropic",
//                 supportsAttachments: true,
//                 supportsImages: true,
//                 supportsStreaming: true,
//                 description: "Anthropic Claude 3.5 Sonnet"
//             },
//             {
//                 model: "claude-3-5-haiku-20241022",
//                 openRouterModel: "anthropic/claude-3.5-haiku",
//                 name: "Claude Haiku 3.5",
//                 provider: "anthropic",
//                 supportsAttachments: true,
//                 supportsImages: true,
//                 supportsStreaming: true,
//                 description: "Anthropic Claude 3.5 Haiku"
//             },
//             {
//                 model: "claude-opus-4-20250514",
//                 openRouterModel: "anthropic/claude-opus-4",
//                 name: "Claude Opus 4",
//                 provider: "anthropic",
//                 supportsAttachments: true,
//                 supportsImages: true,
//                 supportsStreaming: true,
//                 description: "Anthropic Claude Opus 4"
//             },
//             {
//                 model: "claude-sonnet-4-20250514",
//                 openRouterModel: "anthropic/claude-sonnet-4",
//                 name: "Claude Sonnet 4",
//                 provider: "anthropic",
//                 supportsAttachments: true,
//                 supportsImages: true,
//                 supportsStreaming: true,
//                 description: "Anthropic Claude Sonnet 4"
//             },
//         ];
//     }
//     getCapabilities(): ModelCapabilities[] {
//         return AnthropicChat.getCapabilities();
//     }
//     getCurrentModelCapabilities(): ModelCapabilities | undefined {
//         return AnthropicChat.getCapabilities().find(c => c.model === this.model);
//     }
// }

//
// If you're seeign this code please let me tell you i was the only person working on this project actively
// trying to carry it with as many features as possible. the moment this cloneathon is over i will rewrite
// this entire thing. that is. if i win.

