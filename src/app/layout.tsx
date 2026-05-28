import type { Metadata, Viewport } from "next";
import {
  Big_Shoulders_Stencil,
  Fraunces,
  JetBrains_Mono,
  Homemade_Apple,
} from "next/font/google";
import { getServerSession } from "next-auth";
import { Analytics } from "@vercel/analytics/next";

import { AppShell } from "@/components/layout/AppShell";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CelebrationGate } from "@/components/celebration/CelebrationGate";
import { authOptions } from "@/lib/auth";

import { Providers } from "./providers";
import "./globals.css";

/**
 * Root layout — redesign v2.
 *
 * Changes from v1:
 *   - SiteFooter removed (links moved to LeftSidebar quick-links section)
 *   - AppShell added: wraps {children} in the 100vh three-column shell
 *     (LeftSidebar + center column + RightSidebar)
 *   - <html> gets data-theme="dark" and data-accent="primary" as defaults;
 *     the SiteHeader theme switcher overrides these client-side from
 *     localStorage on first render.
 *   - viewport themeColor updated to match dark bg token (#0d1117)
 *
 * Font choice rationale (unchanged from v1):
 *   - Big Shoulders Stencil → caps-lock headlines, tier labels, stats
 *   - Fraunces → editorial body type, profile copy
 *   - JetBrains Mono → caption rails, technical labels, on-chain data
 *   - Homemade Apple → handwritten flourishes, signatures
 *
 * All four loaded via next/font — no FOIT, no external fonts.googleapis.com
 * request at runtime.
 */

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read auth on the server so the header renders the right viewer handle
  // on first paint — no auth flicker, no client-side fetch round-trip.
  const session = await getServerSession(authOptions);
  const viewerHandle = session?.user.handle ?? null;

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
      // Default theme/accent — SiteHeader overrides these from
      // localStorage on mount so there's no flash of wrong theme.
      data-theme="dark"
      data-accent="primary"
    >
      <body>
        <Providers>
          {/* Fixed glass header — outside AppShell so it stays above
              the shell's overflow:hidden container. */}
          <SiteHeader viewerHandle={viewerHandle} />

          {/* App shell — 100vh, three-column, each column scrolls
              independently. Pages render into the center column. */}
          <AppShell>
            {children}
          </AppShell>

          {/* §O1.2 Heavy celebration delivery — mounts globally so a
              rank-up landing on any route surfaces wherever the user is.
              Self-gates on session status; renders nothing for anon.
              viewerInGoodStanding kept for future chrome signals. */}
          <CelebrationGate />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
