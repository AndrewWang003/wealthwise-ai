'use client';

import { Inter } from "next/font/google";
import "@/app/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body className={`${inter.variable} font-sans antialiased`}>
                <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center">
                    <h2 className="mb-4 text-3xl font-bold">Critical Error</h2>
                    <p className="mb-8 text-muted-foreground">{error.message}</p>
                    <button
                        onClick={() => reset()}
                        className="rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
