import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  applicationName: "Socium",
  title: "Socium — Personal Social Manager",
  description: "Local-first, approval-first AI social publishing automation.",
  openGraph: {
    title: "Socium — Personal Social Manager",
    description: "Local-first, approval-first AI social publishing automation.",
    type: "website",
    images: [
      {
        url: "/brand/socium-og-image-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Socium — Personal Social Manager",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark font-sans" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
