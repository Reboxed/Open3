import { User } from "@clerk/nextjs/server";

export async function getUserApiKeys(user: User) {
    if (!user) return { requireByok: false, byok: {}, user };
    const requireByok = process.env.REQUIRE_BYOK === "true" && user.privateMetadata?.team !== true;
    if (!requireByok) return { requireByok, byok: {
        // openaiKey: process.env.OPENAI_API_KEY,
        // anthropicKey: process.env.ANTHROPIC_API_KEY,
        // geminiKey: process.env.GOOGLE_GEN_AI_API_KEY,
        openrouterKey: process.env.OPENROUTER_API_KEY,
    } as Record<string, string>, user };
    const byok = (user.privateMetadata?.byok as Record<string, string>) || {};
    return { requireByok, byok };
}

export function getProviderApiKey(provider: string, byok: Record<string, string>) {
    switch (provider) {
        // case "openai":
        //     return byok.openaiKey || process.env.OPENAI_API_KEY;
        // case "anthropic":
        //     return byok.anthropicKey || process.env.ANTHROPIC_API_KEY;
        // case "google":
        //     return byok.geminiKey || process.env.GOOGLE_GEN_AI_API_KEY;
        case "openrouter":
            return byok.openrouterKey || process.env.OPENROUTER_API_KEY;
        default:
            return undefined;
    }
}

export function byokAvailable(user: User) {
    const requireByok = process.env.REQUIRE_BYOK === "true";
    if (requireByok) {
        if (user && user.privateMetadata?.team !== true) {
            const byok = (user.privateMetadata?.byok as Record<string, string>) || {};
            if (/* !byok.openaiKey && !byok.anthropicKey && !byok.geminiKey && */ !byok.openrouterKey) {
                return false;
            }
        }
    }
    return true;
}
