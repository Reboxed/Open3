import type { Metadata } from "next";
import {
    ClerkProvider
} from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "./components/Navbar";

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
    description: "The Reboxed take on the T3 Chat.",
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
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

