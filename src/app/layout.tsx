import type { Metadata, Viewport } from "next";
import {
  Big_Shoulders_Stencil,
  Fraunces,
  JetBrains_Mono,
  Homemade_Apple,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { Providers } from "./providers";
import { Preloader } from "@/components/preloader/Preloader";
import { NavigationProgress } from "@/components/preloader/NavigationProgress";
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

/**
 * App's own origin for absolute OG / canonical URLs. Open Graph and
 * Twitter-card images MUST be absolute — `metadataBase` lets per-page
 * metadata emit relative paths that Next resolves against this origin.
 *
 * Source order:
 *   1. NEXTAUTH_URL — the canonical URL of THIS Next.js app (already
 *      required by NextAuth; NOT the WP API URL). This is the right
 *      answer in dev and in any deploy that sets it.
 *   2. VERCEL_URL — Vercel injects the deployment host (no scheme) for
 *      preview/prod builds where NEXTAUTH_URL may be omitted.
 *   3. http://localhost:3000 — last-resort dev fallback so a missing
 *      env never crashes metadata generation. In that case absolute
 *      OG URLs point at localhost (only a concern if NEXTAUTH_URL is
 *      unset in a real deploy — set it).
 */
function appOrigin(): string {
  const fromNextAuth = process.env["NEXTAUTH_URL"];
  if (fromNextAuth !== undefined && fromNextAuth !== "") {
    return fromNextAuth.replace(/\/$/, "");
  }
  const fromVercel = process.env["VERCEL_URL"];
  if (fromVercel !== undefined && fromVercel !== "") {
    return `https://${fromVercel}`;
  }
  return "http://localhost:3000";
}

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin()),
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
      // Inline bg prevents the black flash that appears before the stylesheet
      // loads on a hard refresh. Matches --bcc-bg in dark mode (#0d1117).
      // Once CSS loads this value is superseded by var(--bcc-bg).
      style={{ backgroundColor: "#0d1117" }}
    >
      <body>
        <Preloader />
        <NavigationProgress />
        <Providers>
          {children}
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}