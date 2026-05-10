/**
 * /settings/communities — NFT-gated holder communities (§4.7.1).
 *
 * Joined / eligible / opted-out buckets + an auto-join preference
 * toggle. Renders inside SettingsLayout (auth + persistent hero + nav).
 *
 * "Communities" is the user-facing name; the backend term is
 * "holder groups." See lib/api/types.ts for the shape rationale.
 */

import { CommunitiesList } from "@/components/settings/CommunitiesList";

import { SettingsSectionHeader } from "../_components/SettingsSectionHeader";

export default function CommunitiesSettingsPage() {
  return (
    <section className="mx-auto mt-10 max-w-3xl px-6 sm:px-8">
      <SettingsSectionHeader
        eyebrow="COMMUNITIES"
        title="NFT-gated communities"
        blurb="Communities you can unlock by holding the right NFT. Eligibility re-checks at join time, so an empty wallet can't slip through."
      />
      <div className="mt-6">
        <CommunitiesList />
      </div>
    </section>
  );
}
