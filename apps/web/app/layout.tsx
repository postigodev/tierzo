import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tierzo",
  description: "Turn messy lists into tier-list asset packs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
