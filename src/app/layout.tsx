import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Mahall", description: "Masjid-based community management" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
