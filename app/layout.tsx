import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Debate Club",
  description: "Two LLMs argue. A third one judges.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
