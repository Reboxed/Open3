import { OpenAI } from "openai";

// TODO: This should all be moved prooobabbllyyy and adding a model in the future should be as easy as being an admin on the 
// TODO: Open3 site and just adding it in a GUI.

export const AVAILABLE_PROVIDERS = ["google", "openai", "anthropic", "openrouter"];

export interface ChunkResponse {
    content: string;
    urlCitations?: {
        type: "url_citation";
        url_citation: {
            url: string;
            title: string;
            content?: string;
            start_index: number;
            end_index: number;
        }
    }[];
}

export interface Message {
    role?: "user" | "model";
    parts: {
        text?: string;
        // Only set by the model, not by the user
        annotations?: {
            type: "url_citation",
            url_citation: {
                url: string;
                title: string;
                content?: string;
                start_index: number;
                end_index: number;
            }
        }[];
        inlineData?: {
            mimeType: string;
            data: string;
        };
    }[];
    // ONLY USED FOR THE CLIENT REQUESTS, NOT IN THE CLASSES
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
    sendStream(message: Message, withSearch?: boolean, maxCompletionTokens?: number): Promise<ReadableStream>;
    send(message: Message, withSearch?: boolean, maxCompletionTokens?: number): Promise<string>;
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
    private apiKey?: string;

    constructor(history: Message[], model: string, systemPrompt?: string, apiKey?: string) {
        this.model = model;
        this.history = history;
        this.systemPrompt = systemPrompt;
        this.provider = "openrouter";
        this.apiKey = apiKey;
    }

    private mapRole(role?: "user" | "model"): "user" | "assistant" {
        if (role === "model") return "assistant";
        return "user";
    }

    private convertPartsToOpenRouterContent(parts: { text?: string; inlineData?: { mimeType: string; data: string } }[], allowImages: boolean, allowPDFs: boolean) {
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

    async sendStream(message: Message, withSearch?: boolean, maxCompletionTokens?: number): Promise<ReadableStream> {
        if (!this.apiKey) {
            throw new Error("OpenRouter API key is required.");
        }
        if (!message.parts?.length) {
            throw "at least one part is required";
        }

        const caps = this.getCurrentModelCapabilities();
        const allowImages = !!caps?.supportsAttachmentsImages;
        const allowPDFs = !!caps?.supportsAttachmentsPDFs;

        const filteredHistory = this.history.map((msg) => ({
            ...msg,
            parts: this.filterParts(msg.parts, allowImages, allowPDFs)
        }));

        message.parts = this.filterParts(message.parts, allowImages, allowPDFs);
        const messages = [
            ...filteredHistory.map((msg) => ({
                role: this.mapRole(msg.role),
                content: this.convertPartsToOpenRouterContent(msg.parts, allowImages, allowPDFs)
            })),
            {
                role: this.mapRole(message.role),
                content: this.convertPartsToOpenRouterContent(message.parts, allowImages, allowPDFs)
            }
        ];

        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
        };
        headers["HTTP-Referer"] = "https://open3.rebxd.com";
        headers["X-Title"] = "Open3";

        const openRouterMessages: any = messages;
        console.log("Using system prompt:", this.systemPrompt);
        if (this.systemPrompt) {
            openRouterMessages.unshift({
                role: "system",
                content: this.systemPrompt,
            });
        }
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: this.model,
                messages: openRouterMessages,
                max_tokens: maxCompletionTokens,
                stream: true,
                // Enable search if requested
                ...(withSearch ? {
                    plugins: [{ id: "web" }]
                } : {}),
            })
        });
        if (!response.ok && !response.body) {
            throw new Error(`OpenRouter error: ${response.status} ${response.statusText}`);
        }
        if (!response.body) throw new Error("No response body from OpenRouter");
        if (!response.ok) {
            throw new Error(`OpenRouter error: ${response.status} ${response.statusText}: ${(await response.json())?.error?.message || "Unknown erro"}`);
        }

        const reader = response.body.getReader();

        const that = this;
        return new ReadableStream({
            async start(controller) {
                try {
                    const decoder = new TextDecoder();
                    const encoder = new TextEncoder();

                    let fullResponse = "";
                    const webAnnotations: {
                        type: "url_citation",
                        url_citation: {
                            url: string;
                            title: string;
                            content?: string;
                            start_index: number;
                            end_index: number;
                        }
                    }[] = [];

                    let buffer = "";

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });

                        while (true) {
                            const lineEnd = buffer.indexOf("\n");
                            if (lineEnd === -1) break;

                            const line = buffer.slice(0, lineEnd).trim();
                            buffer = buffer.slice(lineEnd + 1);

                            if (line.startsWith("data: ")) {
                                const data = line.slice(6);
                                if (data === "[DONE]") break;

                                try {
                                    const parsed = JSON.parse(data);
                                    const delta = parsed.choices[0].delta;
                                    const content = delta.content;

                                    let urlCitations = [];
                                    if ("annotations" in delta && Array.isArray(delta.annotations)) {
                                        urlCitations = delta.annotations.filter((a: any) => a.type === "url_citation");
                                        webAnnotations.push(...urlCitations);
                                    }

                                    fullResponse += content;
                                    if (content) {
                                        controller.enqueue(encoder.encode(JSON.stringify({
                                            content,
                                            urlCitations,
                                        } as ChunkResponse)));
                                    }
                                } catch (e) {
                                    // ignore parse errors for incomplete lines
                                }
                            }
                        }
                    }

                    if (fullResponse) {
                        that.history.push({
                            role: "model",
                            parts: [{ text: fullResponse, annotations: webAnnotations }],
                        });
                        controller.close();
                    } else {
                        controller.error(new Error("No content received from OpenRouter"));
                    }
                } catch (error) {
                    controller.error(error);
                } finally {
                    reader.cancel();
                }
            }
        });
    }

    async send(message: Message, withSearch?: boolean, maxCompletionTokens?: number): Promise<string> {
        if (!this.apiKey) {
            throw new Error("OpenRouter API key is required.");
        }
        const caps = this.getCurrentModelCapabilities();
        const allowImages = !!caps?.supportsAttachmentsImages;
        const allowPDFs = !!caps?.supportsAttachmentsPDFs;

        const filteredHistory = this.history.map((msg) => ({
            ...msg,
            parts: this.filterParts(msg.parts, allowImages, allowPDFs)
        }));
        message.parts = this.filterParts(message.parts, allowImages, allowPDFs);

        const messages = [
            ...filteredHistory.map((msg) => ({
                role: this.mapRole(msg.role),
                content: this.convertPartsToOpenRouterContent(msg.parts, allowImages, allowPDFs)
            })),
            {
                role: this.mapRole(message.role),
                content: this.convertPartsToOpenRouterContent(message.parts, allowImages, allowPDFs)
            }
        ];

        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
        };
        headers["HTTP-Referer"] = "https://open3.rebxd.com";
        headers["X-Title"] = "Open3";

        const openRouterMessages: any = messages;
        openRouterMessages.unshift({
            role: "system",
            content: this.systemPrompt,
        });
        const body = JSON.stringify({
            model: `${this.model}${withSearch ? ":online" : ""}`,
            messages: openRouterMessages,
            max_tokens: maxCompletionTokens,
            ...(this.systemPrompt ? { system: this.systemPrompt } : {})
        });
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers,
            body
        });
        if (!response.ok) {
            throw new Error(`OpenRouter error: ${response.status} ${response.statusText}`);
        }

        try {
            const data = await response.json();
            const text = data.choices[0].message.content;
            this.history.push({
                role: "model",
                parts: [{ text }],
            });
            return text;
        } catch (e) {
            throw new Error(`Failed to parse OpenRouter response: ${e}`);
        }
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
