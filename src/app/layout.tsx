import type { Metadata } from "next";
import {
    ClerkProvider,
    SignInButton,
    SignUpButton,
    SignedIn,
    SignedOut,
    UserButton,
} from '@clerk/nextjs'
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth, currentUser } from "@clerk/nextjs/server";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";

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

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <ClerkProvider>
            <html lang="en">
                <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex min-h-screen h-full w-full`}>
                    <div className="w-full min-h-full">
                        {children}
                    </div>
                </body>
            </html>
        </ClerkProvider>
    );
}

function LoadingUserComponent() {
    return (
        <div className="h-fit w-full p-3.5 rounded-3xl transition-all cursor-pointer border-white/0 border-1 opacity-65">
            <div className="flex gap-4 items-center">
                <span className="text-transparent w-[36px] h-[36px] rounded-full bg-white/15">.</span>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-white/50 font-light">Hey there,</span>
                    <span className="font-medium text-white/50">Loading...</span>
                </div>
            </div>
        </div>
    )
}

async function UserComponent() {
    const { userId } = await auth()

    if (!userId) {
        return <div>Sign in to view this</div>
    }

    const user = await currentUser()
    if (!user) return <div>Whoops! Something went wrong!</div>

    return (
        <div className="hover:bg-white/[0.03] h-fit w-full p-3.5 rounded-3xl transition-all cursor-pointer hover:border-white/10 border-white/0 border-1">
            <SignedOut>
                <SignInButton />
                <SignUpButton />
            </SignedOut>
            <SignedIn>
                <div className="flex gap-4 items-center">
                    {user.hasImage ? <Image src={user.imageUrl} width={36} height={36} alt="Profile Picture" className="rounded-full" /> : <></>}
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-white/50 font-light">Hey there,</span>
                        <span className="font-medium">{user.fullName ?? user.username}</span>
                    </div>
                </div>
            </SignedIn>
        </div>
    )
}

