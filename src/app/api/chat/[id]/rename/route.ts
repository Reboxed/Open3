import { ApiError } from "@/internal-lib/types/api";
import { NextResponse } from "next/server";

// TODO: Implement this endpoint to rename a chat

export function POST() {
    return NextResponse.json({
        error: "This endpoint is not implemented yet. Please check back later.",
    } as ApiError, { status: 501 });
}