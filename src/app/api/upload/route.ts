import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { mkdir } from "fs/promises";

// Ensure uploads directory exists in public folder
const uploadsDir = join(process.cwd(), "public", "uploads");
await mkdir(uploadsDir, { recursive: true });

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const filename = file.name;
        const filepath = join(uploadsDir, filename);
        await writeFile(filepath, buffer);
        const url = `/uploads/${filename}`;
        return NextResponse.json({ url, filename });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
} 