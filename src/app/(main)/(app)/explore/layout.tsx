import type { Metadata } from "next";

/**
 * Metadata only: /explore (Explore ▸ Validators) is a client page and
 * can't export its own. The Projects and Creators tabs are server pages
 * that export their own title and canonical, which override these.
 */
export const metadata: Metadata = {
  title: "Validators · Blue Collar Crypto",
  description: "Search validators across chains and find their pages on Blue Collar Crypto.",
  alternates: { canonical: "/explore" },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
