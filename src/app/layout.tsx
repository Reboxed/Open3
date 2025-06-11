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
import Link from "next/link";
import { dark } from "@clerk/themes";

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
                <body className={`${geistSans.variable} ${geistMono.variable} antialiased relative min-h-screen h-full w-full max-sm:text-sm`}>
                    <div className="h-fit flex gap-2 pt-4 px-2 justify-center fixed bg-[#212121]/75 backdrop-blur-lg top-0 z-20 w-full">
                        <div className="pb-2 pt-3 px-8 w-fit rounded-t-2xl text-primary-light hover:bg-[#191919]/75 cursor-pointer font-medium transition-all duration-300">
                            <Link href="/" className="!no-underline">
                                Open3 Chat
                            </Link>
                        </div>
                        <div className="pb-2 pt-3 px-6 w-fit cursor-pointer rounded-t-2xl bg-[#191919] font-bold flex justify-center items-center gap-12 relative overflow-visible transition-all duration-300">
                            Test Chat
                            <svg width="15" height="15" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path opacity="0.35" d="M1.38281 1.18701L9.80078 9.6052M1.38281 9.6052L9.80078 1.18723" stroke="white" strokeOpacity="0.64" strokeWidth="1.75"/>
                            </svg>
                        </div>
                        <div className="pb-2 pt-3 px-[calc((48px+24px)/2)] w-fit cursor-pointer rounded-t-2xl hover:bg-[#191919]/75 flex justify-center items-center py-6 text-neutral-200/65 transition-all duration-300">
                            Discord.JS bot
                        </div>
                        <div className="pb-2 pt-3 px-[calc((48px+24px)/2)] w-fit cursor-pointer rounded-t-2xl hover:bg-[#191919]/75 lex justify-center items-center py-6 text-neutral-200/65 transition-all duration-300">
                            Markdown show-off
                        </div>
                        <div className="pl-4 pr-6 h-full w-fit ml-auto">
                            <Suspense fallback={<LoadingUserComponent/>}>
                                <SignedIn>
                                    <UserComponent />
                                </SignedIn>
                                <SignedOut>
                                    <div className="flex gap-4">
                                        <SignInButton />
                                        <SignUpButton />
                                    </div>
                                </SignedOut>
                            </Suspense>
                        </div>
                    </div>
                    <div className="w-full min-h-full absolute top-[64px] bottom-0">
                        {children}
                    </div>
                </body>
            </html>
        </ClerkProvider>
    );
}

function LoadingUserComponent() {
    return (
        <div className="flex gap-4 items-center">
            <span className="text-transparent w-[28px] h-[28px] rounded-full bg-white/15">.</span>
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
        <>
            <SignedOut>
                <SignInButton />
                <SignUpButton />
            </SignedOut>
            <SignedIn>
                <div className="flex gap-4 items-center">
                    <UserButton appearance={{
                        baseTheme: dark,
                        elements: {
                            logoImage: {
                                width: "36px",
                                height: "36px"
                            }
                        }
                    }}/> 
                    {/*user.hasImage ? <Image src={user.imageUrl} width={36} height={36} alt="Profile Picture" className="rounded-full" /> : <></>*/}
                </div>
            </SignedIn>
        </>
    )
}

