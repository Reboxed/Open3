import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default async function middleware(req: NextRequest, event: any) {
    const url = req.nextUrl;
    // Block direct access to /uploads and its subpaths
    if (url.pathname.startsWith("/uploads")) {
        return new NextResponse("Forbidden", { status: 403 });
    }

    // Run Clerk middleware first
    const result = await clerkMiddleware({
        authorizedParties: ["https://open3.rebxd.com", "http://localhost:3000"],
    })(req, event);
    

    // If Clerk returned a response (redirect, error, etc.), modify it
    if (result) {
        result.headers.set("x-pathname", url.pathname);
        return result;
    }

    // If no response was returned (middleware falls through), create one
    const response = NextResponse.next();
    response.headers.set("x-pathname", url.pathname);
    return response;
}

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        // Always run for API routes
        "/(api|trpc)(.*)",
        "/attachments(.*)",
    ],
};
