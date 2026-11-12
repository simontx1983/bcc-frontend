import type { Metadata } from "next";

/** Metadata only: /validators is a client page and can't export its own. */
export const metadata: Metadata = {
  title: "Validators · Blue Collar Crypto",
  description: "Search validators across chains and find their pages on Blue Collar Crypto.",
  alternates: { canonical: "/validators" },
};

export default function ValidatorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
