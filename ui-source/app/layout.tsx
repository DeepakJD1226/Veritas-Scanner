import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veritas | Document Integrity",
  description: "Compare up to 50,000 words against your reference collection using your own matching backend.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
