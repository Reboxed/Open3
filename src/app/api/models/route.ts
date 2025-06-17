import { NextRequest, NextResponse } from "next/server";
import { getAllModelCapabilities } from "@/app/lib/utils/getAllModelCapabilities";

export async function GET(req: NextRequest) {
    return NextResponse.json(getAllModelCapabilities());
}
