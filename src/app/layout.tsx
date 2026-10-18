import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { WealthPulseProvider } from "@/contexts/WealthPulseContext";

import { UserProvider } from "@/contexts/UserContext";
import { PageContextProvider } from "@/contexts/PageContext";
import { AIAssistantWidget } from "@/components/ai/AIAssistantWidget";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "WealthWise AI",
  description: "Intelligent wealth management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`} suppressHydrationWarning={true}>
        <ThemeProvider>
          <FirebaseClientProvider>
            <PageContextProvider>
              <UserProvider>
                <WealthPulseProvider>
                  {children}
                  <AIAssistantWidget />
                </WealthPulseProvider>
              </UserProvider>
            </PageContextProvider>
          </FirebaseClientProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
