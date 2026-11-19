/**
 * BlocksSettingsPanel — owner-only "Blocks" tab.
 * Lifted from the retired /settings/blocks page (§K1 Phase A).
 */

import { BlocksList } from "@/components/settings/BlocksList";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

/** Where focus lands after the last row's unblock (see BlocksList). */
const BLOCKS_HEADING_ID = "bcc-blocks-heading";

export function BlocksSettingsPanel() {
  return (
    <section>
      <SettingsSectionHeader
        eyebrow="BLOCKS"
        title="Blocked users"
        blurb="People you've blocked don't see your posts on the Floor and you don't see theirs. Unblocking is one tap."
        headingId={BLOCKS_HEADING_ID}
      />
      <div className="mt-4">
        <BlocksList headingId={BLOCKS_HEADING_ID} />
      </div>
    </section>
  );
}
