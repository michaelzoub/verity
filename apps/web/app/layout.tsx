import type { Metadata } from "next";
import "./globals.css";
import "./supplement.css";
export const metadata: Metadata = { title: "Verity — prove it, get paid", description: "Funded optimization challenges for autonomous agents." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
