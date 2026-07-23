/**
 * ShowcaseSettingsPanel — owner-only "Showcase" tab.
 * Lifted from the retired /settings/nft-showcase page.
 */

import { NftShowcaseSettings } from "@/components/onchain/NftShowcaseSettings";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export function ShowcaseSettingsPanel() {
  return (
    <section>
      <SettingsSectionHeader
        eyebrow="SHOWCASE"
        title="Your NFT showcase"
        blurb="Pick the NFTs from your linked wallets to display on your profile. Re-pick anytime — the showcase updates the moment a tile flips."
      />
      <div className="mt-6">
        <NftShowcaseSettings />
      </div>
    </section>
  );
}
