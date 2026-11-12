"use client";

/**
 * CommunityJoinCard — a community CardFactory card with live JOIN
 * wiring. The single client-side join surface for community trading
 * cards; consumed by:
 *
 *   - CommunityCardGrid (the /communities discovery grid)
 *   - GroupDetailShell's PageHero card slot
 *
 * Join wiring:
 *   - All four join mutations are mounted unconditionally (Rules of
 *     Hooks — one component must handle any kind) and dispatched by
 *     `card.community_dossier.type`.
 *   - Success → router.refresh(): both surfaces are SSR'd, so
 *     refetching the server component is the source of truth for the
 *     new viewer_is_member state.
 *   - Plain/local joins flip the JOIN cell optimistically; the NFT and
 *     validator paths do NOT (CHECK & JOIN is a speculative on-chain
 *     ownership or delegation check — flipping to MEMBER then snapping
 *     back on a 403 would read as "joined then kicked").
 *   - Errors render under the card via the same §γ key-maps
 *     GroupMembershipStrip uses (copy keyed on err.code, never
 *     err.message).
 *
 * On the detail page this JOIN cell coexists with GroupMembershipStrip
 * in the hero's actions slot — benign duplication by design: both fire
 * the same server mutations and refresh the same SSR truth.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { CardFactory } from "@/components/cards/CardFactory";
import { humanizeMembershipError } from "@/components/groups/GroupMembershipStrip";
import { useJoinHolderGroupMutation } from "@/hooks/useHolderGroups";
import { useJoinHallMutation } from "@/hooks/useHallsPrimary";
import { useJoinPlainGroupMutation } from "@/hooks/useMyGroups";
import {
  humanizeValidatorJoinError,
  useJoinValidatorGroupMutation,
} from "@/hooks/useValidatorGroups";
import type { Card, GroupDiscoveryType } from "@/lib/api/types";

export function CommunityJoinCard({
  card,
  suppressBodyLink = false,
}: {
  card: Card;
  /** Pass true when hosted on the group's own detail page — the card's
   *  body overlay would loop back to the page the viewer is on. The
   *  /communities grid keeps the default (link wanted there). */
  suppressBodyLink?: boolean | undefined;
}) {
  const router = useRouter();
  // Optimistic membership for the plain/hall paths only — see module
  // doc. Replaced by server truth when router.refresh() lands.
  const [optimisticJoined, setOptimisticJoined] = useState(false);

  const refresh = useCallback(() => router.refresh(), [router]);
  const clearOptimistic = useCallback(() => setOptimisticJoined(false), []);

  const holderJoin = useJoinHolderGroupMutation({
    onSuccess: refresh,
    onError: clearOptimistic,
  });
  const hallJoin = useJoinHallMutation({
    onSuccess: refresh,
    onError: clearOptimistic,
  });
  const plainJoin = useJoinPlainGroupMutation({
    onSuccess: refresh,
    onError: clearOptimistic,
  });
  const validatorJoin = useJoinValidatorGroupMutation({ onSuccess: refresh });

  const handleJoin = useCallback(
    (joinCard: Card) => {
      const dossier = joinCard.community_dossier;
      if (dossier === null) return;
      if (dossier.type === "nft") {
        // No optimistic flip — server adjudicates ownership.
        holderJoin.mutate(joinCard.id, {
          onSuccess: () => captureCommunityJoined(dossier.type),
        });
        return;
      }
      if (dossier.type === "validator") {
        // No optimistic flip — the server verifies the delegation live.
        // Never the plain join: that route 400s on a delegator community.
        validatorJoin.mutate(joinCard.id, {
          onSuccess: () => captureCommunityJoined(dossier.type),
        });
        return;
      }
      setOptimisticJoined(true);
      if (dossier.type === "hall") {
        hallJoin.mutate(joinCard.id, {
          onSuccess: () => captureCommunityJoined(dossier.type),
        });
      } else {
        plainJoin.mutate(joinCard.id, {
          onSuccess: () => captureCommunityJoined(dossier.type),
        });
      }
    },
    [holderJoin, hallJoin, plainJoin, validatorJoin],
  );

  const joinPending =
    holderJoin.isPending ||
    hallJoin.isPending ||
    plainJoin.isPending ||
    validatorJoin.isPending;
  const joinError = holderJoin.error ?? hallJoin.error ?? plainJoin.error;
  const joinErrorCopy =
    validatorJoin.error !== null
      ? humanizeValidatorJoinError(validatorJoin.error)
      : joinError !== null
        ? humanizeMembershipError(joinError, "join")
        : null;

  return (
    // The stage gets an explicit width. Below 381px `.bcc-card` switches to
    // `width: 100%` of its stage (globals.css), but `items-center` shrinks
    // the stage to its content — so the 100% resolved against nothing and
    // the card, JOIN included, collapsed to 0px on 375px phones (C2, UX
    // scan 2026-11-12). w-full + max-w-[316px] keeps it centred at every
    // width and never wider than the card's desktop size.
    <div className="flex flex-col items-center gap-2 [&>.bcc-card-stage]:w-full [&>.bcc-card-stage]:max-w-[316px]">
      <CardFactory
        card={card}
        onJoin={handleJoin}
        isJoined={optimisticJoined}
        joinPending={joinPending}
        suppressBodyLink={suppressBodyLink}
      />
      {joinErrorCopy !== null && (
        <p
          role="alert"
          className="bcc-mono max-w-[316px] text-center text-[10px] tracking-[0.12em] text-bcc-text-error"
        >
          {joinErrorCopy}
        </p>
      )}
    </div>
  );
}

function captureCommunityJoined(communityType: GroupDiscoveryType) {
  captureAnalyticsEvent("community_joined", { community_type: communityType });
}
