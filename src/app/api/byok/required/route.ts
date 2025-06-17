import { byokAvailable } from "@/app/lib/utils/byok";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const required = !byokAvailable(user);
    return NextResponse.json({ required });
}
