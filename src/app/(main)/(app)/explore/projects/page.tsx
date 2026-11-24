import type { Metadata } from "next";

import { KindDirectoryPage } from "../KindDirectoryPage";

/** Explore ▸ Projects. /directory?kind=project forwards here. */
export const metadata: Metadata = {
  title: "Projects · Blue Collar Crypto",
  description: "Browse the projects graded on Blue Collar Crypto and find their pages.",
  alternates: { canonical: "/explore/projects" },
};

export default function ExploreProjectsPage() {
  return <KindDirectoryPage kind="project" />;
}
