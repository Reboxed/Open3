import { ApiError } from "@/internal-lib/types/api";
import { byokAvailable } from "@/internal-lib/utils/byok";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" } as ApiError, { status: 401 });
    const required = !byokAvailable(user);
    return NextResponse.json({ required });
}
