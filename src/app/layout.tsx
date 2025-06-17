import type { Metadata } from "next";
import {
    ClerkProvider,
} from '@clerk/nextjs'
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "./components/Navbar";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Open3 Chat",
    description: "The Rebxd take on the T3 Chat.",
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    // Require login with Clerk
    // const user = await auth();
    // if (!user?.userId) {
    //     redirect("/sign-in");
    // }
    // BYOK enforcement logic
    // const requireByok = process.env.REQUIRE_BYOK === "true";
    // let needsByok = false;
    // if (requireByok) {
    //     const current = await currentUser();
    //     if (current && current.privateMetadata?.team !== true) {
    //         const byok = (current.privateMetadata?.byok as Record<string, string>) || {};
    //         if (!byok.openaiKey && !byok.anthropicKey && !byok.geminiKey) {
    //             needsByok = true;
    //         }
    //     }
    // }
    // // Prevent infinite redirect loop on /settings
    // if (needsByok) {
    //     const h = await headers();
    //     const pathname = h.get("x-pathname") || "";
    //     if (!pathname.startsWith("/settings")) {
    //         redirect("/settings");
    //     }
    // }

    return (
        <html lang="en">
            <ClerkProvider>
                <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen w-full max-sm:text-sm`}>
                    <Navbar />
                    <main className="w-full min-h-0 flex-1 flex flex-col">
                        {children}
                    </main>
                </body>
            </ClerkProvider>
        </html>
    );
}

