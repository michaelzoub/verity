import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./supplement.css";
import "./landing.css";
import "./marketplace.css";
import { CompanyAuthProvider } from "@/components/privy-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Verity — prove it, get paid",
  description: "Funded optimization challenges for autonomous agents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body><CompanyAuthProvider>{children}</CompanyAuthProvider></body>
    </html>
  );
}
