/**
 * /broadcast — placeholder until the activity-feed surface ships.
 *
 * No backend equivalent exists yet; this is a V2 product surface.
 * Stubbed so the SiteHeader nav doesn't 404.
 */

import { UnderConstructionPage } from "@/components/layout/UnderConstructionPage";

export default function BroadcastPage() {
  return (
    <UnderConstructionPage
      rail="FLOOR // BROADCAST"
      kicker="BROADCAST"
      headline="Standby. Channel coming online."
      body="Broadcast is the live activity stream — trades, validations, dispute outcomes, validator reports — all routed through one rolling feed. It's on the V2 roadmap. The Floor stays your daily driver until then."
      badge="ROADMAP // V2"
    />
  );
}
