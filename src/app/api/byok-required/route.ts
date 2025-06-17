import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
    const requireByok = process.env.REQUIRE_BYOK === "true";
    let required = false;
    if (requireByok) {
        const user = await currentUser();
        if (user && user.privateMetadata?.team !== true) {
            const byok = (user.privateMetadata?.byok as Record<string, string>) || {};
            if (!byok.openaiKey && !byok.anthropicKey && !byok.geminiKey) {
                required = true;
            }
        }
    }
    return NextResponse.json({ required });
}
