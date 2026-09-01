import type { Metadata, Viewport } from "next";
import {
  Big_Shoulders_Stencil,
  Fraunces,
  JetBrains_Mono,
  Homemade_Apple,
} from "next/font/google";
import { getServerSession } from "next-auth";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { Providers } from "./providers";
import { Preloader } from "@/components/preloader/Preloader";
import { NavigationProgress } from "@/components/preloader/NavigationProgress";
import { authOptions } from "@/lib/auth";
import { appOrigin } from "@/lib/app-origin";
import { isIndexableEnvironment } from "@/lib/seo/indexing";
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
  metadataBase: new URL(appOrigin()),
  title: "Blue Collar Crypto",
  description: "The Floor — trust, identity, and reputation for crypto operators.",
  // Site-wide de-indexing for every deployment that is not the real
  // production host: staging, previews, *.vercel.app project URLs, local,
  // and anything with a missing or unresolvable origin.
  //
  // This is the ONLY de-indexing signal in this scope — no X-Robots-Tag
  // header is added (that would need next.config.ts headers or a widened
  // auth middleware, both out of bounds). That is also why robots.ts leaves
  // non-production CRAWLABLE: a crawler blocked by robots.txt would never
  // fetch the page and never see this tag.
  //
  // Next merges metadata down the route tree, so a child route can override
  // this. Nothing does today — no other file in the app exports a `robots`
  // key except /u/me and /u/[handle], and both only ever tighten it to
  // noindex, never to index:true.
  ...(isIndexableEnvironment()
    ? {}
    : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  // <meta name="theme-color"> content is parsed as a CSS <color> with no
  // element to resolve against, so var() never resolves and the browser
  // drops the tag — the app shipped no theme color at all. Must be the
  // literal value of --bcc-night, which is a fixed brand constant that
  // never flips with theme, so it cannot drift.
  // color-token-guard:allow — meta content can't resolve a CSS variable
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
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

  // Server-resolved session, handed to SessionProvider as initial state
  // so useSession() resolves to "authenticated"/"unauthenticated" on the
  // very first client render — no "loading" flash for the header's
  // icon cluster / avatar on a normal page load.
  const session = await getServerSession(authOptions);

  return (
    <html
      lang="en"
      className={fontVars}
      data-theme="dark"
      data-accent="primary"
      // Inline bg prevents the black flash that appears before the stylesheet
      // loads on a hard refresh. Matches --bcc-bg in dark mode (var(--bcc-night)).
      // Once CSS loads this value is superseded by var(--bcc-bg).
      style={{ backgroundColor: "var(--bcc-night)" }}
    >
      <body>
        <Preloader />
        <NavigationProgress />
        <Providers session={session}>
          {children}
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}