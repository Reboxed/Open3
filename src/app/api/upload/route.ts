import { NextRequest, NextResponse } from "next/server";
import { unlink, writeFile } from "fs/promises";
import { join } from "path";
import { mkdir } from "fs/promises";
import { currentUser } from "@clerk/nextjs/server";
import redis, { GET_LOOKUP_KEY, USER_FILES_KEY } from "@/app/lib/redis";

// Ensure uploads directory exists in public folder
const uploadsDir = join(process.cwd(), "public", "uploads");
await mkdir(uploadsDir, { recursive: true });
//export const URL_PREFIX = "/uploads/";

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const requireByok = process.env.REQUIRE_BYOK === "true";
    if (requireByok) {
        if (user && user.privateMetadata?.team !== true) {
            const byok = (user.privateMetadata?.byok as Record<string, string>) || {};
            if (!byok.openaiKey && !byok.anthropicKey && !byok.geminiKey) {
                return NextResponse.json({ error: "BYOK keys are required" }, { status: 403 });
            }
        }
    }

    let filepath: string | null = null;
    let randomName: string | null = null;
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        if (buffer.length === 0) {
            return NextResponse.json({ error: "File is empty" }, { status: 400 });
        }
        if (buffer.length > 10 * 1024 * 1024) { // 10 MB limit
            return NextResponse.json({ error: "File is too large" }, { status: 400 });
        }
        if (!file.name || !file.type) {
            return NextResponse.json({ error: "File name or type is missing" }, { status: 400 });
        }
        const allowedTypes = ["image/jpeg", "image/png", "image/gif", "application/json", "application/x-yaml", "application/pdf", "application/octet-stream"];
        if (!allowedTypes.includes(file.type) && !file.type.startsWith("text/")) {
            return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
        }

        let filename = file.name;
        const fileExtension = filename.split(".").pop()?.toLowerCase();

        // Efficient duplicate check using lookup key
        let increment = 0;
        let lookupKey = GET_LOOKUP_KEY(user.id, null, filename);
        let exists = await redis.get(lookupKey);
        while (exists) {
            increment += 1;
            const base = filename.replace(new RegExp(`(\\.${fileExtension})$`), "");
            filename = `${base} (${increment}).${fileExtension}`;
            lookupKey = GET_LOOKUP_KEY(user.id, null, filename);
            exists = await redis.get(lookupKey);
        }
        lookupKey = GET_LOOKUP_KEY(user.id, null, filename);

        randomName = `${crypto.randomUUID()}.${fileExtension}.upload`;
        filepath = join(uploadsDir, randomName);

        await writeFile(filepath, buffer);
        await writeFile(filepath + ".meta.json", JSON.stringify({
            originalName: filename,
            mimeType: file.type,
            size: buffer.length,
            uploadedAt: new Date().toISOString(),
            user: user.id,
        }, null, 2));
        await redis.hset(USER_FILES_KEY(user.id), randomName, JSON.stringify({
            originalName: filename,
            user: user.id,
            chat: null,
        }));
        await redis.set(lookupKey, randomName);

        //const url = `${URL_PREFIX}${randomName}`;
        return NextResponse.json({ filename, url: "/attachments/global/" + filename });
    } catch (error) {
        console.error("Upload error:", error);
        if (filepath) {
            unlink(filepath).catch(err => {
                console.error("Failed to delete temporary file:", filepath, err);
            });

            unlink(filepath + ".meta.json").catch(err => {
                console.error("Failed to delete temporary file:", filepath + ".meta.json", err);
            });
        }

        if (randomName) {
            redis.hdel(USER_FILES_KEY(user.id), randomName).catch(err => {
                console.error("Failed to remove file from Redis:", randomName, err);
            });
        }

        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.banned) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const filename = req.nextUrl.searchParams.get('filename');
    if (!filename) {
        return NextResponse.json({ error: "Filename required" }, { status: 400 });
    }
    // Find the nulled lookup key
    const lookupKey = GET_LOOKUP_KEY(user.id, null, filename);
    const randomName = await redis.get(lookupKey);
    if (!randomName) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const filePath = join(uploadsDir, randomName);
    try {
        await unlink(filePath).catch(() => {});
        await unlink(filePath + ".meta.json").catch(() => {});
        await redis.del(lookupKey);
        await redis.hdel(USER_FILES_KEY(user.id), randomName);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
    }
}
