import { ApiError } from "@/internal-lib/types/api";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// POST: Save BYOK keys to Clerk private metadata
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
  const { /* openaiKey, anthropicKey, geminiKey, */ openrouterKey } = await req.json();
  
  await (await clerkClient()).users.updateUserMetadata(user.id, {
    privateMetadata: {
      ...(user.privateMetadata || {}),
      byok: {
        ...(user.privateMetadata?.byok || {}),
        // openaiKey,
        // anthropicKey,
        // geminiKey,
        openrouterKey,
      },
    },
  });
  return NextResponse.json({ success: true });
}

// GET: Retrieve BYOK keys from Clerk private metadata
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
  const byok = (user.privateMetadata?.byok as Record<string, string>) || {};
  return NextResponse.json({ byok });
}
