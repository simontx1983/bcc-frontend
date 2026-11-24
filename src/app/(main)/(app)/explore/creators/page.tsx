import type { Metadata } from "next";

import { KindDirectoryPage } from "../KindDirectoryPage";

/** Explore ▸ Creators. /directory?kind=creator forwards here. */
export const metadata: Metadata = {
  title: "Creators · Blue Collar Crypto",
  description: "Browse the creators graded on Blue Collar Crypto and find their pages.",
  alternates: { canonical: "/explore/creators" },
};

export default function ExploreCreatorsPage() {
  return <KindDirectoryPage kind="creator" />;
}
