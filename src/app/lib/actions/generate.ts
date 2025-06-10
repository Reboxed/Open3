"use server";

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "" });

export async function sendMessage(model: string) {
    const response = await ai.models.generateContentStream({
        model: model,
        contents: "",
        config: {
            systemInstruction: "You're an assistant in a chat application titled `Open3`. Don't mention your model unless specifically asked. Respond in markdown for styling unless otherwise specified by the user.",
        }
    });
}

