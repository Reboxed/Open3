"use client";
import { useEffect, useState } from "react";

export default function BYOKSetupPage() {
    const [openaiKey, setOpenaiKey] = useState("");
    const [anthropicKey, setAnthropicKey] = useState("");
    const [geminiKey, setGeminiKey] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        fetch("/api/byok")
            .then((res) => res.json())
            .then((data) => {
                if (data.byok) {
                    setOpenaiKey(data.byok.openaiKey || "");
                    setAnthropicKey(data.byok.anthropicKey || "");
                    setGeminiKey(data.byok.geminiKey || "");
                }
            });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        await fetch("/api/byok", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ openaiKey, anthropicKey, geminiKey }),
        });
        setLoading(false);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <div className="flex flex-col">
                <h1 className="text-2xl font-bold mb-4">Bring Your Own Key Setup</h1>
                <span className="max-w-135"><strong>Inference is expensive!!</strong> I wanted to, at first, release this for free and then $6/mo or summin but i couldn&apos;t get all that done in the time of the hackathon (especially the registrations required for it), BUT I am dedicated to fully even refactor this project after and release it both Open-Source and hosted.</span>
                <br/>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-135">
                    <label className="w-full">
                        <h3>Gemini API Key</h3>
                        <input
                            type="password"
                            className="input input-bordered w-full bg-white/5 p-2 px-4 rounded-2xl"
                            value={geminiKey}
                            onChange={(e) => setGeminiKey(e.target.value)}
                            placeholder="..."
                        />
                        (Required for title generation)
                    </label>
                    <label className="w-full">
                        <h3>OpenAI API Key</h3>
                        <input
                            type="password"
                            className="input input-bordered w-full bg-white/5 p-2 px-4 rounded-2xl"
                            value={openaiKey}
                            onChange={(e) => setOpenaiKey(e.target.value)}
                            placeholder="sk-..."
                        />
                    </label>
                    <label className="w-full">
                        <h3>Anthropic API Key</h3>
                        <input
                            type="password"
                            className="input input-bordered w-full bg-white/5 p-2 px-4 rounded-2xl"
                            value={anthropicKey}
                            onChange={(e) => setAnthropicKey(e.target.value)}
                            placeholder="claude-..."
                        />
                        (Note: Anthropic is untested because I couldn&apos;t afford it, sorry)
                    </label>
                    <span className="max-w-113 opacity-65">OpenRouter support coming soon!</span>
                    <button type="submit" className="bg-white/10 py-3 rounded-xl cursor-pointer" disabled={loading}>
                        {loading ? "Saving..." : "Save Keys"}
                    </button>
                    {success && <div className="text-green-600">Saved!</div>}
                </form>
            </div>
        </div>
    );
}
