import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SpendSilo — Supplier Spend Intelligence",
  description:
    "Snap a photo of an invoice. Review the extracted data. Get clean supplier spend reports by week, month, quarter, and year.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SpendSilo",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  // keep the app full-width on phones; allow zoom for accessibility
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      {/* extensions (e.g. ColorZilla's cz-shortcut-listen) inject attributes on
          body before hydration; suppress that benign attribute mismatch only here */}
      <body className="min-h-full" suppressHydrationWarning>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
