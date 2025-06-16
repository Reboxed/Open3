import { Content, GoogleGenAI } from "@google/genai";

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

export interface Chat {
    label?: string;
    model: string;
    provider: string;
    sendStream(message: Message): Promise<ReadableStream>;
    send(message: Message): Promise<string>;
    getHistory(): Message[];
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
}
