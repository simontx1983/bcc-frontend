/**
 * Whether a validator page's delegator-group block has anything to show:
 * a group, a group the viewer may create (with at least one option), or the
 * server's reason why neither is possible. ONE rule for the Delegators tab
 * (EntityProfile, a server component, decides whether the tab exists) and
 * the panel itself (DelegatorGroupPanel renders nothing otherwise).
 *
 * Plain module (no hooks, no JSX): server and client components share it.
 */

import type { DelegatorGroupBlock } from "@/lib/api/types";

export function delegatorGroupHasContent(
  block: Pick<DelegatorGroupBlock, "group" | "can_create" | "options" | "unavailable_reason">,
): boolean {
  if (block.group !== null) return true;
  if (block.can_create && block.options.length > 0) return true;
  return block.unavailable_reason !== null;
}
