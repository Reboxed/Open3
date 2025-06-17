import { currentUser, User } from "@clerk/nextjs/server";

export async function getUserApiKeys() {
    const user = await currentUser();
    if (!user) return { requireByok: false, byok: {}, user };
    const requireByok = process.env.REQUIRE_BYOK === "true" && user.privateMetadata?.team !== true;
    const byok = (user.privateMetadata?.byok as Record<string, string>) || {};
    return { requireByok, byok, user };
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
