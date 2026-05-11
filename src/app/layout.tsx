import type { Metadata, Viewport } from "next";
import { Big_Shoulders_Stencil, Fraunces, JetBrains_Mono, Homemade_Apple } from "next/font/google";
import { getServerSession } from "next-auth";

import { CelebrationGate } from "@/components/celebration/CelebrationGate";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { authOptions } from "@/lib/auth";

import { Providers } from "./providers";
import "./globals.css";

/**
 * Root layout — sets up the four BCC fonts via next/font/google,
 * wraps everything in client-side providers (React Query +
 * NextAuth SessionProvider), and renders a single <main> slot.
 *
 * Font choice rationale:
 *   - Big Shoulders Stencil → caps-lock headlines, numerals,
 *     stencil aesthetic for tier labels and stats.
 *   - Fraunces → editorial body type. Magazine feel for profile copy.
 *   - JetBrains Mono → caption rails, technical labels, on-chain data.
 *   - Homemade Apple → handwritten flourishes (signatures, margin notes).
 *
 * All four are loaded via next/font so they're inlined in the build
 * (no FOIT, no external request to fonts.googleapis.com at runtime).
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
  variable: "--font-fraunces",
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
  themeColor: "#14110d",
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

  const fontVars = `${stencil.variable} ${fraunces.variable} ${mono.variable} ${script.variable}`;
  return (
    <html lang="en" className={fontVars}>
      <body>
        <Providers>
          <SiteHeader viewerHandle={viewerHandle} />
          {children}
          {/* SiteFooter receives viewerHandle so the 3-column index can
              switch its third column between "Account" (authed) and
              "Get Started" (anon), and so the anon-only acquisition
              strip can mount. viewerInGoodStanding is omitted today —
              wire it from the session once that signal is server-
              resolvable; without it the contextual stamp stays hidden. */}
          <SiteFooter viewerHandle={viewerHandle} />
          {/* §O1.2 Heavy celebration delivery — mounts globally so a
              rank-up landing on any route surfaces wherever the user is.
              Self-gates on session status; renders nothing for anon. */}
          <CelebrationGate />
        </Providers>
      </body>
    </html>
  );
}
