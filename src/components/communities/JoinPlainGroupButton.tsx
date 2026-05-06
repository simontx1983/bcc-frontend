"use client";

/**
 * JoinPlainGroupButton — drop-in client component for the /communities
 * discovery page (§4.7.4) that wires the plain-group join action
 * (§4.7.3) to a `GroupActionButton`.
 *
 * Render only when the card is a `user`/`system` kind with `open`
 * privacy — closed/secret are rejected by the backend with a hint
 * pointing at PeepSo's request-flow page, and we don't replicate that
 * UI here. The page-level guard belongs to the caller; this component
 * trusts the caller and just wires the mutation.
 *
 * Anonymous users see the button (per §N7 — gated actions stay
 * visible). Click → 401 → inline error renders the server's "Sign in
 * required." copy verbatim.
 *
 * On success the page-level membership state isn't currently
 * surfaced in the discovery view-model, so we drive a `router.refresh()`
 * to re-render the server component — this keeps the surface honest if
 * the backend ever adds `viewer_membership` to GroupDiscoveryItem.
 */

import { useRouter } from "next/navigation";

import { GroupActionButton } from "@/components/groups/GroupActionButton";
import { useJoinPlainGroupMutation } from "@/hooks/useMyGroups";

export function JoinPlainGroupButton({ groupId }: { groupId: number }) {
  const router = useRouter();
  const mutation = useJoinPlainGroupMutation({
    onSuccess: () => {
      router.refresh();
    },
  });

  return (
    <GroupActionButton
      groupId={groupId}
      label="JOIN"
      pendingLabel="JOINING…"
      isPending={mutation.isPending}
      errorMessage={mutation.error?.message ?? null}
      onClick={() => {
        mutation.reset();
        mutation.mutate(groupId);
      }}
    />
  );
}
