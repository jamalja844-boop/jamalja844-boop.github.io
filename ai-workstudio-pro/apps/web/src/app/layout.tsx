import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "AI WorkStudio Pro", template: "%s · AI WorkStudio Pro" },
  description: "Eén AI-werkplek voor chatten, schrijven, programmeren, documenten, browsertaken en samenwerkende AI-agents.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#061327" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
