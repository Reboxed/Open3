import { NextRequest, NextResponse } from "next/server";
import { getAllModelCapabilities } from "@/app/lib/utils/getAllModelCapabilities";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const model = searchParams.get("model");
    const provider = searchParams.get("provider");
    let all = getAllModelCapabilities();
    if (model) {
        all = all.filter((m: any) => m.model === model || m.name === model);
    }
    if (provider) {
        all = all.filter((m: any) => m.provider === provider);
    }
    return NextResponse.json(all);
}
