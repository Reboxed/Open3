import { NextRequest, NextResponse } from "next/server";
import { getAllModelCapabilities } from "@/internal-lib/utils/getAllModelCapabilities";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const model = searchParams.get("model");
    const provider = searchParams.get("provider");
    let all = getAllModelCapabilities();
    if (model) {
        const m = all.get(model)
        all = m ? new Map([[model, m]]) : new Map(all.entries().filter(m => m[1].name === model));
    } else if (provider) {
        all = new Map(all.entries().filter(m => m[1].provider === provider));
    }
    return NextResponse.json(all.entries().toArray());
}
