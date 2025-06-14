import type { Metadata } from "next";
import {
    ClerkProvider,
} from '@clerk/nextjs'
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "./components/Navbar";
import { ApiError } from "./api/tabs/route";
import { ApiTab } from "./api/tabs/route";
import { cookies } from "next/headers";

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
    const tabs = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/tabs`, {
        headers: { Cookie: (await cookies()).toString() }
    }).then(res => res.json() as Promise<ApiTab[] | ApiError>)
        .catch(() => null);
    if (!tabs || "error" in tabs) {
        return (
            <html>
                <body>
                    <span>Something went wrong trying to load tabs.</span>
                </body>
            </html>
        );
    }

    return (
        <html lang="en">
            <ClerkProvider>
                <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen h-screen w-full max-sm:text-sm`}>
                    <Navbar tabs={tabs} />
                    <main className="w-full h-auto grow">
                        {children}
                    </main>
                </body>
            </ClerkProvider>
        </html>
    );
}

