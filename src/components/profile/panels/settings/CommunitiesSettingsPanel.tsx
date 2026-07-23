/**
 * CommunitiesSettingsPanel — owner-only "Communities" tab.
 *
 * Lifted from the retired /settings/communities page. NFT-gated holder
 * communities (§4.7.1): joined / eligible / opted-out buckets plus the
 * auto-join preference. Distinct from the public "Groups" tab, which
 * lists the groups this member already belongs to.
 */

import { CommunitiesList } from "@/components/settings/CommunitiesList";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export function CommunitiesSettingsPanel() {
  return (
    <section>
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
