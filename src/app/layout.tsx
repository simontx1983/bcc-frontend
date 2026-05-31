import type { Metadata, Viewport } from "next";
import {
  Big_Shoulders_Stencil,
  Fraunces,
  JetBrains_Mono,
  Homemade_Apple,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import { Providers } from "./providers";
import "./globals.css";

const stencil = Big_Shoulders_Stencil({
  subsets: ["latin"],
  weight: ["400", "700", "800", "900"],
  variable: "--font-stencil",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

const script = Homemade_Apple({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-script",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Blue Collar Crypto",
  description: "The Floor — trust, identity, and reputation for crypto operators.",
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontVars = [
    stencil.variable,
    fraunces.variable,
    mono.variable,
    script.variable,
  ].join(" ");

  return (
    <html
      lang="en"
      className={fontVars}
      data-theme="dark"
      data-accent="primary"
    >
      <body>
        <Providers>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}