import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Xperience — Event workspace",
  description:
    "Turn event conversations into reviewed plans, clear tasks, and actionable insights.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
