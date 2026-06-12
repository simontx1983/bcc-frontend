"use client";

/**
 * CommunityJoinCard — a community CardFactory card with live JOIN
 * wiring. The single client-side join surface for community trading
 * cards; consumed by:
 *
 *   - CommunityCardGrid (the /communities discovery grid)
 *   - GroupDetailShell's PageHero card slot (hideOpenAction — the
 *     OPEN cell would loop back to the page you're on)
 *
 * Join wiring:
 *   - All three join mutations are mounted unconditionally (Rules of
 *     Hooks — one component must handle any kind) and dispatched by
 *     `card.community_dossier.type`.
 *   - Success → router.refresh(): both surfaces are SSR'd, so
 *     refetching the server component is the source of truth for the
 *     new viewer_is_member state.
 *   - Plain/local joins flip the JOIN cell optimistically; the NFT
 *     path does NOT (CHECK & JOIN is a speculative on-chain ownership
 *     check — flipping to MEMBER then snapping back on a 403 would
 *     read as "joined then kicked").
 *   - Errors render under the card via the same §γ key-map
 *     GroupMembershipStrip uses (copy keyed on err.code, never
 *     err.message).
 *
 * On the detail page this JOIN cell coexists with GroupMembershipStrip
 * in the hero's actions slot — benign duplication by design: both fire
 * the same server mutations and refresh the same SSR truth.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { CardFactory } from "@/components/cards/CardFactory";
import { humanizeMembershipError } from "@/components/groups/GroupMembershipStrip";
import { useJoinHolderGroupMutation } from "@/hooks/useHolderGroups";
import { useJoinLocalMutation } from "@/hooks/useLocalsPrimary";
import { useJoinPlainGroupMutation } from "@/hooks/useMyGroups";
import type { Card } from "@/lib/api/types";

export function CommunityJoinCard({
  card,
  hideOpenAction = false,
}: {
  card: Card;
  hideOpenAction?: boolean;
}) {
  const router = useRouter();
  // Optimistic membership for the plain/local paths only — see module
  // doc. Replaced by server truth when router.refresh() lands.
  const [optimisticJoined, setOptimisticJoined] = useState(false);

  const refresh = useCallback(() => router.refresh(), [router]);
  const clearOptimistic = useCallback(() => setOptimisticJoined(false), []);

  const holderJoin = useJoinHolderGroupMutation({
    onSuccess: refresh,
    onError: clearOptimistic,
  });
  const localJoin = useJoinLocalMutation({
    onSuccess: refresh,
    onError: clearOptimistic,
  });
  const plainJoin = useJoinPlainGroupMutation({
    onSuccess: refresh,
    onError: clearOptimistic,
  });

  const handleJoin = useCallback(
    (joinCard: Card) => {
      const dossier = joinCard.community_dossier;
      if (dossier === null) return;
      if (dossier.type === "nft") {
        // No optimistic flip — server adjudicates ownership.
        holderJoin.mutate(joinCard.id);
        return;
      }
      setOptimisticJoined(true);
      if (dossier.type === "local") {
        localJoin.mutate(joinCard.id);
      } else {
        plainJoin.mutate(joinCard.id);
      }
    },
    [holderJoin, localJoin, plainJoin],
  );

  const joinPending =
    holderJoin.isPending || localJoin.isPending || plainJoin.isPending;
  const joinError = holderJoin.error ?? localJoin.error ?? plainJoin.error;

  return (
    <div className="flex flex-col items-center gap-2">
      <CardFactory
        card={card}
        onJoin={handleJoin}
        isJoined={optimisticJoined}
        joinPending={joinPending}
        hideOpenAction={hideOpenAction}
      />
      {joinError !== null && (
        <p
          role="alert"
          className="bcc-mono max-w-[316px] text-center text-[10px] tracking-[0.12em] text-safety"
        >
          {humanizeMembershipError(joinError, "join")}
        </p>
      )}
    </div>
  );
}
