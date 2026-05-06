/**
 * /settings/blocks — §K1 Phase A blocked-users list.
 *
 * Renders inside SettingsLayout (auth + persistent hero + nav).
 * BlocksList fetches state via useMyBlocks and lets the user remove
 * blocks one by one.
 */

import { BlocksList } from "@/components/settings/BlocksList";

import { SettingsSectionHeader } from "../_components/SettingsSectionHeader";

export default function BlocksSettingsPage() {
  return (
    <section className="mx-auto mt-10 max-w-3xl px-8">
      <SettingsSectionHeader
        eyebrow="BLOCKS"
        title="Blocked users"
        blurb="People you've blocked don't see your posts on the Floor and you don't see theirs. Unblocking is one tap."
      />
      <div className="mt-4">
        <BlocksList />
      </div>
    </section>
  );
}
