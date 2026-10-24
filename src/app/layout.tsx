import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TIME TRAVELER — How well do you know the past?",
  description:
    "One photo. One guess. Travel through time. Guess the year of five authentic historical photographs in a beautiful, free photography game.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "TIME TRAVELER",
    description:
      "How well do you know the past? Five photographs. One trip through time.",
    type: "website",
  },
};
export const viewport: Viewport = {
  themeColor: "#F4F1EA",
  width: "device-width",
  initialScale: 1,
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
