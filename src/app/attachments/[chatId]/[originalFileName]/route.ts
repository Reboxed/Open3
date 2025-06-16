import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { readFile, stat } from "fs/promises";
import { auth } from "@clerk/nextjs/server";
import redis, { GET_LOOKUP_KEY } from "@/app/lib/redis";

const uploadsDir = join(process.cwd(), "public", "uploads");

export async function GET(
    _: NextRequest,
    { params }: { params: Promise<{ chatId: string; originalFileName: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { chatId, originalFileName } = await params;
    if (!chatId || !originalFileName) {
        return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    // O(1) lookup for the file key
    const lookupKey = GET_LOOKUP_KEY(userId, chatId == "global" ? null : chatId, originalFileName);
    console.log(lookupKey, " :: ", userId, ",", chatId, ",", originalFileName);
    const fileKey = await redis.get(lookupKey);
    if (!fileKey) {
        return NextResponse.json({ error: "File not found or access denied" }, { status: 404 });
    }

    const filePath = join(uploadsDir, fileKey);
    try {
        await stat(filePath);
        const metaPath = filePath + ".meta.json";
        let fileMeta: any = null;
        try {
            const metaRaw = await readFile(metaPath, "utf8");
            fileMeta = JSON.parse(metaRaw);
        } catch { }
        const fileBuffer = await readFile(filePath);

        // Determine if the file should be forced to download
        const forbiddenInlineExts = [
            ".html", ".htm", ".php", ".js", ".ts", ".jsx", ".tsx"
        ];
        const lowerName = (fileMeta?.originalName || originalFileName).toLowerCase();
        const shouldForceDownload = forbiddenInlineExts.some(ext => lowerName.endsWith(ext));

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type": fileMeta?.mimeType || "application/octet-stream",
                "Content-Disposition": `${shouldForceDownload ? "attachment" : "inline"}; filename=\"${fileMeta?.originalName || originalFileName}\"`,
                "Cache-Control": "private, max-age=31536000",
            },
        });
    } catch {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
}
