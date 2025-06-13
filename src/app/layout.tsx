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
import TabInterface from "./components/TabInterface";
import "./globals.css";
import { auth, currentUser } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { dark } from "@clerk/themes";
import querystring from "querystring";
import { ApiError, ApiTab } from "./api/tab/route";

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
    const tabsReq = await fetch(`http://localhost:3000/api/tab?user_id=${querystring.escape("test")}`);
    const tabs = await tabsReq.json() as ApiTab[] | ApiError;
    if ("error" in tabs) {
        return <span>Something went wrong...</span>
    }

    return (
        <ClerkProvider>
            <html lang="en">
                <body className={`${geistSans.variable} ${geistMono.variable} antialiased relative min-h-screen h-full w-full max-sm:text-sm`}>
                    <nav className="h-fit flex gap-2 pt-3 px-2 justify-center fixed bg-[#212121]/75 backdrop-blur-lg top-0 z-20 w-full">
                        <div className="relative shrink-0 flex gap-2 w-full justify-center">
                            <TabInterface tabs={[
                                { id: "home", label: "Open3", link: "/", permanent: true },
                                ...tabs.map(tab => ({ id: tab.id, label: tab.label, link: `/${tab.id}` }))
                            ]} />
                            <div className="pl-4 pr-6 h-full w-fit ml-auto">
                                <Suspense fallback={<LoadingUserComponent />}>
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
                    </nav>
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
                    }} />
                    {/*user.hasImage ? <Image src={user.imageUrl} width={36} height={36} alt="Profile Picture" className="rounded-full" /> : <></>*/}
                </div>
            </SignedIn>
        </>
    )
}

