import type { Metadata } from "next";

import { ForValidators } from "@/components/landing/ForValidators";

const TITLE = "For validators · Blue Collar Crypto";
const DESCRIPTION =
  "Your validator already has a page on Blue Collar Crypto. What it is, what the Trust Score means, and how to claim it with one free signature.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/for-validators" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/for-validators" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function ForValidatorsPage() {
  return <ForValidators />;
}
