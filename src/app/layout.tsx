import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "AudioReader - Your PDFs, Narrated",
  description: "Smooth, audiobook-style reading for your PDF documents using native text-to-speech.",
  manifest: "/Saurabh-s-Audio-Reader/manifest.json",
  icons: {
    icon: "/Saurabh-s-Audio-Reader/icon.png",
    apple: "/Saurabh-s-Audio-Reader/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
