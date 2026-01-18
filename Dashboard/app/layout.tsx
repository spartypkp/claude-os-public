import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/core/toast-provider";
import { AppShell } from "@/components/core/AppShell";
import { Providers } from "@/components/core/Providers";

export const metadata: Metadata = {
  title: "Claude OS",
  description: "Your intelligent operating system. Claude manages your calendar, contacts, priorities, and workflows - all in one integrated workspace.",
  keywords: ["claude", "ai assistant", "life management", "productivity", "claude os"],
  applicationName: "Claude OS",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#DA7756',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="http://localhost:5001" />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>
          <ToastProvider />
          <Suspense fallback={null}>
            <AppShell>
              {children}
            </AppShell>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
