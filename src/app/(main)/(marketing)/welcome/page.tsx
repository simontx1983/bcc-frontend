import type { Metadata } from "next";

import { FloorIntro } from "@/components/landing/FloorIntro";

/**
 * /welcome — the guest landing page (Direction A "LEDGER"). Anon `/`
 * middleware-rewrites here so the URL bar stays "/" for guests; authed
 * "/" renders the (app) feed instead. Also reachable directly at
 * `/welcome` (the handover's documented fallback if the rewrite ever
 * needs replacing with a redirect).
 */
export const metadata: Metadata = {
  title: "Blue Collar Crypto — Reputation you can't buy",
  description:
    "On-chain reputation, earned in public. No paid placement, no sponsored grades, no bought checkmarks — the only currency on the floor is the work you actually did.",
};

export default function WelcomePage() {
  return <FloorIntro />;
}
