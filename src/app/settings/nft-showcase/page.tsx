/**
 * /settings/nft-showcase — host page for the Phase-2 NFT picker.
 *
 * Renders inside SettingsLayout (auth + persistent hero + nav). The
 * actual surface lives in the client component because it owns the
 * modal-open state and runs the React Query hooks for the saved
 * selections list. This page is a server-rendered shell.
 */

import { NftShowcaseSettings } from "@/components/onchain/NftShowcaseSettings";

import { SettingsSectionHeader } from "../_components/SettingsSectionHeader";

export default function NftShowcaseSettingsPage() {
  return (
    <section className="mx-auto mt-10 max-w-3xl px-8">
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
