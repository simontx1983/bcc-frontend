/**
 * BlocksSettingsPanel — owner-only "Blocks" tab.
 * Lifted from the retired /settings/blocks page (§K1 Phase A).
 */

import { BlocksList } from "@/components/settings/BlocksList";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export function BlocksSettingsPanel() {
  return (
    <section>
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
