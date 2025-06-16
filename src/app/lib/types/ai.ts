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

        // Prepare message parts including attachments
        const messageParts = [...message.parts];
        if (message.attachments && message.attachments.length > 0) {
            for (const att of message.attachments) {
                try {
                    const fullUrl = new URL(att.url, process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').toString();
                    const response = await fetch(fullUrl);
                    const blob = await response.blob();

                    if (/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(att.filename)) {
                        // Handle images
                        const arrayBuffer = await blob.arrayBuffer();
                        const base64 = Buffer.from(arrayBuffer).toString('base64');
                        messageParts.push({
                            inlineData: {
                                mimeType: blob.type,
                                data: base64
                            }
                        });
                    } else {
                        // Handle all other file types
                        const fileType = blob.type;
                        const fileSize = blob.size;
                        const fileInfo = `[File: ${att.filename} (${fileType}, ${(fileSize / 1024).toFixed(1)}KB)]`;

                        // Try to read as text first
                        try {
                            const text = await blob.text();
                            // Check if the text is readable (not binary)
                            if (/^[\x00-\x08\x0E-\x1F\x7F-\x9F]/.test(text)) {
                                throw new Error('Binary content');
                            }
                            messageParts.push({ 
                                text: `${fileInfo}\nContent:\n${text}` 
                            });
                        } catch (textError) {
                            // If text reading fails, try to get file metadata
                            const metadata = {
                                type: fileType,
                                size: fileSize,
                                name: att.filename
                            };
                            messageParts.push({ 
                                text: `${fileInfo}\nMetadata: ${JSON.stringify(metadata, null, 2)}` 
                            });
                        }
                    }
                } catch (error) {
                    console.error('Error processing file:', error);
                    messageParts.push({ 
                        text: `[Failed to process file: ${att.filename}]` 
                    });
                }
            }
        }

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
