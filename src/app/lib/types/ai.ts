import { Content, GoogleGenAI } from "@google/genai";

export interface Message {
    role?: "user" | "model";
    parts: { text: string }[];
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
    private history: Content[] = [];

    constructor(history: Message[], model: string) {
        this.model = model;
        this.history = history;
        this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEN_AI_API_KEY })
    }

    async sendStream(message: Message): Promise<ReadableStream> {
        if (!message.parts[0]) {
            throw "at least one part is required";
        }

        const chat = this.ai.chats.create({
            model: this.model,
            history: this.history
        });

        this.history.push(message);
        const result = await chat.sendMessageStream({
            message: message.parts,
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
                        }]
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
        return message.parts[0].text ?? ""
    }

    getHistory(): Message[] {
        return this.history.map((msg) => ({
            role: msg.role,
            parts: msg.parts
        } as Message));
    }
}
