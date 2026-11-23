"use client";

/**
 * GroupMembershipStrip — the "your status here" panel on the §4.7.5
 * group-detail page. Cross-kind: works for nft / hall / system / user /
 * validator groups via the same kind-dispatched wrapper pattern that
 * `components/profile/panels/GroupsPanel.tsx` uses.
 *
 * Action precedence (matches GroupsPanel exactly per §A4 / §N7):
 *   1. permissions.can_leave.allowed → LEAVE button
 *   2. permissions.can_join.allowed  → JOIN button
 *   3. F-272 closed / secret groups (v1.132), from the server's
 *      `viewer_membership.status` + `permissions.can_request_join`:
 *      invited → ACCEPT / DECLINE; requested → CANCEL REQUEST;
 *      can_request_join.allowed → REQUEST TO JOIN
 *   4. permissions.can_join.unlock_hint !== null → render hint verbatim
 *   5. otherwise → no action surface
 *
 * On success → `router.refresh()` re-fetches the parent server component
 * (the page is SSR'd). This matches `HallMembershipControls` and is
 * simpler than React-Query cache surgery for an SSR'd parent.
 *
 * The frontend does NOT recompute eligibility — the server's
 * `permissions{}` block is the single source of truth (§A2).
 */

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { GroupActionButton } from "@/components/groups/GroupActionButton";
import {
  MEMBERSHIP_REQUESTS_ANCHOR,
  canManageMembership,
} from "@/components/groups/membership-gate";
import { GroupTransferOwnership } from "@/components/groups/GroupTransferOwnership";
import { HolderLeaveConfirm, ValidatorLeaveConfirm } from "@/components/groups/HolderLeaveConfirm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useJoinHolderGroupMutation } from "@/hooks/useHolderGroups";
import {
  useJoinHallMutation,
  useLeaveHallMutation,
} from "@/hooks/useHallsPrimary";
import {
  useAcceptGroupInviteMutation,
  useCancelJoinRequestMutation,
  useDeclineGroupInviteMutation,
  useJoinPlainGroupMutation,
  useLeavePlainGroupMutation,
  useRequestJoinGroupMutation,
} from "@/hooks/useMyGroups";
import {
  humanizeValidatorJoinError,
  isJoinCooldown,
  useJoinValidatorGroupMutation,
} from "@/hooks/useValidatorGroups";
import { useLinkWalletMutation, useMyWallets } from "@/hooks/useWallets";
import type {
  BccApiError,
  GroupDetailResponse,
  GroupMembershipStatus,
  GroupValidatorStats,
} from "@/lib/api/types";
import { isAllowed, reasonCode, unlockHint } from "@/lib/permissions";
import { findWalletChain } from "@/lib/wallet/chain-catalog";
import { humanizeCode } from "@/lib/api/errors";
import { humanizeLinkError } from "@/lib/wallet/linkFlow";

interface GroupMembershipStripProps {
  group: GroupDetailResponse;
  /**
   * The Members tab's URL, on routes that have one (the community
   * sub-routes: `/communities/{slug}/members`). The pending-requests
   * pointer links to its requests block. Omitted, there is no pointer.
   */
  membersHref?: string;
}

/**
 * §γ — join/leave failures render the returned string inline; copy is
 * keyed on err.code, never err.message. `verb` is "join" | "leave";
 * `noun` is what the viewer is joining, "group" or "Hall".
 *
 * F-317 M-gr1 — `bcc_forbidden` on a join (contract §4.7 / §4.7.1 /
 * §4.7.3):
 *   - a holder, delegator or plain join answers it ONLY for a suspended
 *     account, so it says so;
 *   - a Hall join answers it for a suspended account, a Hall closed to
 *     open joining, AND a moderator's ban, with nothing in `error.data` to
 *     tell them apart. The Hall line is one that is true of all three
 *     (a suspended member used to be told the Hall "doesn't accept open
 *     membership").
 * A 409 means the server's state moved under the viewer; callers refresh
 * the page on it (`useMembershipHandlers`), so the line says it is showing
 * the latest. A leave refused with `bcc_permission_denied` is only ever
 * the owner (§4.7.1 / §4.7.3).
 *
 * Exported for reuse by CommunityJoinCard (the community trading card
 * joins through the same three mutations and must speak the same
 * copy).
 */
export function humanizeMembershipError(
  err: unknown,
  verb: "join" | "leave",
  noun: "group" | "Hall",
): string {
  return humanizeCode(
    err,
    {
      bcc_rate_limited: `Slow down — too many ${verb} attempts. Wait a minute.`,
      bcc_unauthorized: `Sign in to ${verb} this ${noun}.`,
      bcc_permission_denied:
        verb === "leave"
          ? "Owners can't leave their own community. Hand off ownership first."
          : // A join's bcc_permission_denied is "doesn't hold it", but also
            // admin approval required, invite-only and a moderator's
            // removal (§4.7.1 / §4.7.3), with no reason_code to tell them
            // apart. "Requirements … yet" was untrue for the last three.
            `You can't join this ${noun} right now.`,
      ...(verb === "join"
        ? {
            bcc_forbidden:
              noun === "Hall"
                ? "You can't join this Hall right now."
                : "Your account is suspended, so you can't join communities right now.",
            // Holder join: the ownership check could not run, or the write
            // failed. Fail-closed and retryable; never an eligibility answer.
            bcc_upstream_unavailable: "Couldn't confirm your membership just now. Nothing changed — try again.",
          }
        : {}),
      bcc_conflict: "This changed a moment ago. Showing the latest.",
      bcc_unavailable: "Something went wrong on our side. Nothing changed — try again.",
    },
    `Couldn't ${verb} this ${noun}. Try again.`,
  );
}

/**
 * Optimistic intent recorded the instant a join/leave action fires —
 * lets the pill predict the post-mutation state and skip the ~500ms
 * `router.refresh()` round-trip flicker. Reset to null on action error
 * so a failed mutation snaps back to the server-truthful pill.
 */
type OptimisticIntent = "joining" | "leaving" | null;

/**
 * F-317 M-gr2 — how a strip mutation tells the strip "I succeeded, the
 * refresh I'm about to fire may swap the control the viewer pressed".
 * Outside a strip (no provider) it is a no-op.
 */
const MembershipActedContext = createContext<() => void>(() => {});

/**
 * The strip's join/leave handlers: refresh the SSR'd page on success, and
 * on a 409 too, since a conflict means the server's state moved under the
 * viewer (the copy above says "Showing the latest"). Both tell the strip
 * first (focus, M-gr2), like useRefreshOnSettle. Any failure snaps the
 * optimistic pill back.
 */
function useMembershipHandlers(onActionError: () => void): {
  onSuccess: () => void;
  onError: (err: BccApiError) => void;
} {
  const router = useRouter();
  const markActed = useContext(MembershipActedContext);
  return {
    onSuccess: () => {
      markActed();
      router.refresh();
    },
    onError: (err) => {
      onActionError();
      if (err.code !== "bcc_conflict") return;
      markActed();
      router.refresh();
    },
  };
}

export function GroupMembershipStrip({ group, membersHref }: GroupMembershipStripProps) {
  const [optimisticIntent, setOptimisticIntent] = useState<OptimisticIntent>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Set by a strip mutation that SUCCEEDED (or hit a 409), just before it
  // refreshes the page (`useRefreshOnSuccess` / `useRefreshOnSettle`, via
  // context). A press that failed or a dialog that was cancelled never
  // sets it. Cleared on every refresh, whether or not anything changed.
  const actedRef = useRef(false);
  const markActed = useCallback(() => {
    actedRef.current = true;
  }, []);
  const isMember = group.viewer_membership?.is_member ?? null;
  const status = group.viewer_membership?.status;

  // F-317 M-gr2: the refresh after a join / leave swaps the control the
  // viewer pressed (JOIN becomes LEAVE, a different component), and focus
  // fell to <body> with it. When the viewer's membership VALUE changed
  // after a strip mutation succeeded, focus moves to the control that
  // replaced it, or to the heading when there is none. Focus the viewer
  // has moved somewhere else is left alone.
  //
  // Keyed on the value, not on the `viewer_membership` object: every
  // router.refresh hands a new object, so a refresh that changed nothing
  // here (a manager approving a request on the Members tab) must not move
  // focus onto LEAVE, where the next Enter would leave. Declared before
  // the effect below, so it reads the flag before that one clears it.
  useEffect(() => {
    if (!actedRef.current) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const next = bodyRef.current?.querySelector<HTMLElement>(
      "button:not([disabled]):not([aria-disabled='true'])",
    );
    (next ?? headingRef.current)?.focus();
  }, [isMember, status]);

  // When the server-supplied membership changes (router.refresh landed),
  // the in-flight optimistic prediction has been replaced with truth —
  // clear it so a future action starts from a clean state. Every refresh
  // also spends the focus flag, so it can never carry over to a later,
  // unrelated one.
  useEffect(() => {
    setOptimisticIntent(null);
    actedRef.current = false;
  }, [group.viewer_membership]);

  return (
    <article
      className="bcc-paper bcc-stage-reveal"
      style={{ ["--stagger" as string]: "100ms" }}
    >
      <header className="bcc-paper-head">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="bcc-stencil"
          style={{ fontSize: "16px", letterSpacing: "0.18em" }}
        >
          Your status here
        </h3>
        <MembershipPill
          membership={group.viewer_membership}
          optimisticIntent={optimisticIntent}
        />
      </header>

      <div ref={bodyRef} className="px-6 py-5">
        {/* Above the action: this is where a delegator decides to join, so
            what they'd be verified against has to be in view first. */}
        {group.type === "validator" && group.validator_stats != null && (
          <ValidatorServed stats={group.validator_stats} />
        )}
        <MembershipActedContext.Provider value={markActed}>
          <MembershipBody
            group={group}
            onActionStart={setOptimisticIntent}
            onActionError={() => setOptimisticIntent(null)}
          />
        </MembershipActedContext.Provider>
        {membersHref !== undefined && (
          <PendingRequestsPointer group={group} membersHref={membersHref} />
        )}
        <MembershipAnnouncer
          membership={group.viewer_membership}
          noun={group.type === "hall" ? "Hall" : "group"}
        />
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Body — branches on `permissions` to render leave / join / hint /
// nothing per §A4 / §N7 precedence.
// ──────────────────────────────────────────────────────────────────────

interface MembershipBodyProps {
  group: GroupDetailResponse;
  onActionStart: (intent: OptimisticIntent) => void;
  onActionError: () => void;
}

function MembershipBody({ group, onActionStart, onActionError }: MembershipBodyProps) {
  const { permissions } = group;

  if (isAllowed(permissions, "can_leave")) {
    return (
      <LeaveAction group={group} onActionStart={onActionStart} onActionError={onActionError} />
    );
  }
  if (isAllowed(permissions, "can_join")) {
    return (
      <JoinAction group={group} onActionStart={onActionStart} onActionError={onActionError} />
    );
  }
  // V1.6 — surface `can_leave.unlock_hint` when present. Today this is
  // the `owner_cannot_leave` case (owners can't drop their own group
  // without a handoff); future server-pinned leave gates surface here
  // too without a per-reason FE branch. Ranked above the join-hint
  // path because an existing-member's blocker is more informative
  // than a not-yet-joined nudge.
  const leaveHint = unlockHint(permissions, "can_leave");
  if (leaveHint !== null) {
    // Rank Phase 7 (§21.2) — the handoff the hint alludes to. Only
    // User-kind (member-created) communities transfer, and only the
    // owner sees it. `owner_cannot_leave` is the server's own "viewer
    // is the owner" signal (§A2) — no client-side role recomputation.
    // Against a pre-Phase-7 backend the control still mounts (the
    // reason code predates Phase 7); a submit there 404s into the
    // generic error copy.
    const isOwner =
      group.type === "user" &&
      reasonCode(permissions, "can_leave") === "owner_cannot_leave";
    return (
      <div className="flex flex-col">
        <UnlockHint hint={leaveHint} />
        {isOwner && <GroupTransferOwnership group={group} />}
      </div>
    );
  }
  // F-272 — closed / secret plain groups. The server says where the viewer
  // stands (`viewer_membership.status`) and whether they may ask
  // (`can_request_join`); nothing here recomputes it.
  const status = group.viewer_membership?.status;
  if (status === "invited") {
    return <InviteAnswer groupId={group.id} groupName={group.name} />;
  }
  if (status === "requested") {
    return <PendingRequest groupId={group.id} />;
  }
  if (isAllowed(permissions, "can_request_join")) {
    return <RequestToJoin groupId={group.id} />;
  }
  // A refused or cooled-down ask explains itself (e.g. the 7-day wait
  // after a denied request).
  const requestHint = unlockHint(permissions, "can_request_join");
  if (requestHint !== null && reasonCode(permissions, "can_request_join") === "cooldown") {
    return <UnlockHint hint={requestHint} />;
  }
  // NFT holder group, authenticated non-member, server couldn't pre-confirm
  // ownership (the detail view-model never runs a live on-chain check at
  // page-load — RPC cost). Instead of a dead LOCKED badge, offer a
  // CHECK & JOIN button that fires the canonical eligibility round-trip
  // (POST /me/holder-groups/:id/join). Gated on `not_eligible` specifically
  // so the anonymous `auth_required` gate still falls through to the
  // sign-in hint, and non-NFT gates (trust_threshold / invite_only /
  // requires_approval) keep their verbatim LOCKED hint.
  if (
    group.type === "nft" &&
    !isAllowed(permissions, "can_join") &&
    reasonCode(permissions, "can_join") === "not_eligible"
  ) {
    return (
      <HolderEligibilityCheck
        group={group}
        onActionStart={onActionStart}
        onActionError={onActionError}
      />
    );
  }
  // Delegator community, same reasoning: the detail view-model never runs a
  // live LCD check at page-load, so the verified join is the check.
  if (
    group.type === "validator" &&
    !isAllowed(permissions, "can_join") &&
    reasonCode(permissions, "can_join") === "not_eligible"
  ) {
    return (
      <ValidatorEligibilityCheck
        group={group}
        onActionStart={onActionStart}
        onActionError={onActionError}
      />
    );
  }
  const joinHint = unlockHint(permissions, "can_join");
  if (joinHint !== null) {
    return <UnlockHint hint={joinHint} />;
  }
  return <RestingCopy />;
}

interface ActionDispatchProps {
  group: GroupDetailResponse;
  onActionStart: (intent: OptimisticIntent) => void;
  onActionError: () => void;
}

// ──────────────────────────────────────────────────────────────────────
// Per-type wrappers. Each binds one mutation hook to GroupActionButton
// and `router.refresh()`es the SSR'd parent on success so the
// view-model re-fetches with fresh `viewer_membership` + `permissions`.
//
// Hooks can't be conditional, so each kind gets its own component.
// Same pattern as GroupsPanel.tsx — kept verbatim so a future refactor
// to a shared per-kind dispatcher can lift both surfaces at once.
// ──────────────────────────────────────────────────────────────────────

function JoinAction({ group, onActionStart, onActionError }: ActionDispatchProps) {
  const handlers = { onActionStart, onActionError };
  switch (group.type) {
    case "nft":
      return <HolderJoinButton groupId={group.id} {...handlers} />;
    case "validator":
      return <ValidatorEligibilityCheck group={group} {...handlers} />;
    case "hall":
      return <HallJoinButton groupId={group.id} {...handlers} />;
    case "user":
    case "system":
      return <PlainJoinButton groupId={group.id} {...handlers} />;
  }
}

function LeaveAction({ group, onActionStart, onActionError }: ActionDispatchProps) {
  const handlers = { onActionStart, onActionError };
  switch (group.type) {
    case "nft":
      return <HolderLeaveButton groupId={group.id} {...handlers} />;
    case "validator":
      return <ValidatorLeaveButton groupId={group.id} {...handlers} />;
    case "hall":
      return <HallLeaveButton groupId={group.id} {...handlers} />;
    case "user":
    case "system":
      return <PlainLeaveButton groupId={group.id} {...handlers} />;
  }
}

interface ActionButtonProps {
  groupId: number;
  onActionStart: (intent: OptimisticIntent) => void;
  onActionError: () => void;
}

/** On success: tell the strip (focus, M-gr2), then re-read the SSR'd page. */
function useRefreshOnSuccess(): () => void {
  const router = useRouter();
  const markActed = useContext(MembershipActedContext);
  return () => {
    markActed();
    router.refresh();
  };
}

function HolderJoinButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const mutation = useJoinHolderGroupMutation(useMembershipHandlers(onActionError));
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "join", "group")
    : null;
  return (
    <ActionRow primaryCopy="Join the group to read its feed and post inside it.">
      <GroupActionButton
        groupId={groupId}
        label="JOIN"
        pendingLabel="JOINING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
        touchTarget
        onClick={() => {
          mutation.reset();
          onActionStart("joining");
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

/**
 * CHECK & JOIN — for an NFT holder group the viewer isn't yet a confirmed
 * holder of. Fires the same join mutation as HolderJoinButton (the endpoint
 * is join-if-eligible: it runs the live on-chain ownership check and joins
 * the user when they qualify, or returns a collection-aware 403 when they
 * don't). Unlike HolderJoinButton it does NOT set the optimistic "joining"
 * intent: success here is genuinely uncertain, and flipping the pill to
 * MEMBER then snapping back on a not-eligible 403 would read as "joined then
 * kicked". The pill resolves from server truth — MEMBER only after
 * router.refresh() lands on a successful join.
 */
function HolderEligibilityCheck({ group, onActionStart, onActionError }: ActionDispatchProps) {
  void onActionStart; // intentionally unused — no optimistic flip on a speculative check
  const onSuccess = useRefreshOnSuccess();
  const join = useJoinHolderGroupMutation({ onSuccess, onError: onActionError });
  return (
    <EligibilityCheck
      group={group}
      join={join}
      connectCopy={(chainLabel) => `Connect a ${chainLabel} wallet to verify you hold this NFT.`}
      fallbackHint="Hold an NFT from this collection to join."
      humanizeJoinError={(err) => humanizeMembershipError(err, "join", "group")}
      // F-317 M-gr1: only the "doesn't hold it" answer, bcc_permission_denied
      // (§4.7.1). It used to show for every code but a rate limit: a
      // suspension, a provider outage, an unsupported chain. A moderator's
      // eviction shares that code with no reason_code on the holder route
      // (the delegator route has one), so it still shows there; a backend
      // reason_code would let this drop it too.
      offerAnotherWallet={(err) => err.code === "bcc_permission_denied"}
    />
  );
}

/**
 * CHECK & JOIN for a delegator community. Same shape and same no-optimistic
 * reasoning as HolderEligibilityCheck, against the verified route. Another
 * wallet is only offered after a real "not enough delegation" answer: when
 * the LCD couldn't be read or a cooldown is running, linking one more wallet
 * changes nothing.
 */
function ValidatorEligibilityCheck({ group, onActionStart, onActionError }: ActionDispatchProps) {
  void onActionStart; // intentionally unused — no optimistic flip on a speculative check
  const onSuccess = useRefreshOnSuccess();
  const join = useJoinValidatorGroupMutation({ onSuccess, onError: onActionError });
  return (
    <EligibilityCheck
      group={group}
      join={join}
      connectCopy={(chainLabel) =>
        `Connect a ${chainLabel} wallet to verify you delegate to this validator.`
      }
      fallbackHint="Delegate to this validator to join its community."
      humanizeJoinError={humanizeValidatorJoinError}
      offerAnotherWallet={(err) => err.code === "bcc_permission_denied" && !isJoinCooldown(err)}
    />
  );
}

interface EligibilityCheckProps {
  group: GroupDetailResponse;
  /** The kind's join-if-eligible mutation. Bound by the wrappers above. */
  join: {
    isPending: boolean;
    error: BccApiError | null;
    reset: () => void;
    mutate: (groupId: number) => void;
    mutateAsync: (groupId: number) => Promise<unknown>;
  };
  connectCopy: (chainLabel: string) => string;
  fallbackHint: string;
  humanizeJoinError: (err: unknown) => string;
  offerAnotherWallet: (err: BccApiError) => boolean;
}

function EligibilityCheck({
  group,
  join,
  connectCopy,
  fallbackHint,
  humanizeJoinError,
  offerAnotherWallet,
}: EligibilityCheckProps) {
  const link = useLinkWalletMutation();
  // CHECK & JOIN only checks wallets the user has ALREADY linked + verified
  // (the server does no fresh wallet/signature round-trip). A user with no
  // wallet on this group's chain would get a misleading "hold an NFT" 403, so
  // instead we let them connect + sign + link a wallet inline, then join.
  // `chain_tag` is the group's required chain SLUG (server-resolved); linked
  // wallets carry the same slug vocabulary. Exact-slug match mirrors the
  // backend's exact-chain holdings lookup (no EVM-family leniency). Degrade to
  // CHECK & JOIN on loading / error / untagged / non-linkable chain — never
  // block on a wallets fetch, never crash. Picking which CTA to show is a UI
  // affordance, not an eligibility computation — the server still owns the
  // ownership decision when the join fires.
  const wallets = useMyWallets();
  const requiredChain = group.chain_tag;
  const chainOpt = requiredChain !== null ? findWalletChain(requiredChain) : undefined;
  const canConnect = chainOpt !== undefined;
  const noMatchingWallet =
    requiredChain !== null &&
    wallets.isSuccess &&
    !wallets.data.items.some(
      (w) => w.verified && w.chain_slug === requiredChain
    );

  const busy = link.isPending || join.isPending;
  // Phase-aware pending label for the connect flow: the wallet popup first,
  // then the server-side ownership check.
  const connectLabel = link.isPending ? "WAITING FOR WALLET…" : "VERIFYING…";

  // Shared orchestration: connect + sign + link a wallet on the group's chain,
  // then immediately attempt the join. Sequential — linkWallet sets verified_at
  // server-side before it resolves, so the join's holdings lookup sees the new
  // wallet (no snapshot race). No optimistic pill flip; server truth only.
  async function connectAndJoin() {
    if (chainOpt === undefined) return;
    link.reset();
    join.reset();
    try {
      await link.mutateAsync({ chainSlug: chainOpt.slug, chainType: chainOpt.chainType });
      await join.mutateAsync(group.id);
    } catch {
      // Errors surface via link.error / join.error below.
    }
  }

  // Provider / user-cancel copy from the link step takes precedence; otherwise
  // §γ-keyed join copy (collection-aware not-eligible / opt-out / rate-limit).
  const joinErrorMessage = join.error ? humanizeJoinError(join.error) : null;
  const errorMessage = link.error ? humanizeLinkError(link.error) : joinErrorMessage;

  // No verified wallet on the group's chain → connect one inline, then join.
  if (noMatchingWallet && canConnect) {
    return (
      <ActionRow primaryCopy={connectCopy(chainOpt.label)}>
        <GroupActionButton
          groupId={group.id}
          label="CONNECT WALLET & VERIFY"
          pendingLabel={connectLabel}
          isPending={busy}
          errorMessage={errorMessage}
          touchTarget
          onClick={() => {
            void connectAndJoin();
          }}
        />
      </ActionRow>
    );
  }

  // Has a wallet on the chain (or we couldn't determine) → CHECK & JOIN against
  // the already-linked wallet (no signature). When the kind's
  // `offerAnotherWallet` says the refusal is one another wallet could fix
  // (not eligible), offer a secondary "connect another wallet" so a user
  // holding the NFT or stake in an unlinked wallet can link it and retry.
  const hint = unlockHint(group.permissions, "can_join") ?? fallbackHint;
  const showConnectAnother =
    canConnect && join.error !== null && offerAnotherWallet(join.error) && !busy;
  return (
    <div className="flex flex-col gap-3">
      <ActionRow primaryCopy={hint}>
        <GroupActionButton
          groupId={group.id}
          label="CHECK & JOIN"
          pendingLabel={busy ? connectLabel : "CHECKING…"}
          isPending={busy}
          errorMessage={errorMessage}
          touchTarget
          onClick={() => {
            link.reset();
            join.reset();
            join.mutate(group.id);
          }}
        />
      </ActionRow>
      {showConnectAnother && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void connectAndJoin();
            }}
            className="bcc-mono inline-flex min-h-[44px] shrink-0 items-center border-2 border-cardstock-edge px-3 text-[11px] tracking-[0.18em] text-ink-soft transition motion-reduce:transition-none hover:border-ink/50 hover:text-ink disabled:opacity-60"
          >
            CONNECT ANOTHER WALLET
          </button>
        </div>
      )}
    </div>
  );
}

// Holder leave starts a 90-day cooldown, so it confirms first (Hall and
// plain leaves below do not). The optimistic pill flips on confirm.
function HolderLeaveButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const onSuccess = useRefreshOnSuccess();
  return (
    <ActionRow primaryCopy="You're an active member. Posts you make here scope to this group's feed.">
      <HolderLeaveConfirm
        groupId={groupId}
        humanizeError={(err) => humanizeMembershipError(err, "leave", "group")}
        touchTarget
        onLeaveStart={() => onActionStart("leaving")}
        onSuccess={onSuccess}
        onError={onActionError}
      />
    </ActionRow>
  );
}

// Delegator leave records the same 90-day opt-out as a holder leave, so it
// confirms first too (F-244 item 1). The optimistic pill flips on confirm.
function ValidatorLeaveButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const onSuccess = useRefreshOnSuccess();
  return (
    <ActionRow primaryCopy="You're an active member. Posts you make here scope to this group's feed.">
      <ValidatorLeaveConfirm
        groupId={groupId}
        humanizeError={(err) => humanizeMembershipError(err, "leave", "group")}
        touchTarget
        onLeaveStart={() => onActionStart("leaving")}
        onSuccess={onSuccess}
        onError={onActionError}
      />
    </ActionRow>
  );
}

function HallJoinButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const mutation = useJoinHallMutation(useMembershipHandlers(onActionError));
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "join", "Hall")
    : null;
  return (
    <ActionRow primaryCopy="Join the group to read its feed and post inside it.">
      <GroupActionButton
        groupId={groupId}
        label="JOIN"
        pendingLabel="JOINING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
        touchTarget
        onClick={() => {
          mutation.reset();
          onActionStart("joining");
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

function HallLeaveButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const mutation = useLeaveHallMutation(useMembershipHandlers(onActionError));
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "leave", "Hall")
    : null;
  return (
    <ActionRow primaryCopy="You're an active member of this Hall.">
      <GroupActionButton
        groupId={groupId}
        label="LEAVE"
        pendingLabel="LEAVING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
        touchTarget
        onClick={() => {
          mutation.reset();
          onActionStart("leaving");
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

function PlainJoinButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const mutation = useJoinPlainGroupMutation(useMembershipHandlers(onActionError));
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "join", "group")
    : null;
  return (
    <ActionRow primaryCopy="Join the group to read its feed and post inside it.">
      <GroupActionButton
        groupId={groupId}
        label="JOIN"
        pendingLabel="JOINING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
        touchTarget
        onClick={() => {
          mutation.reset();
          onActionStart("joining");
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

function PlainLeaveButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const mutation = useLeavePlainGroupMutation(useMembershipHandlers(onActionError));
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "leave", "group")
    : null;
  return (
    <ActionRow primaryCopy="You're an active member.">
      <GroupActionButton
        groupId={groupId}
        label="LEAVE"
        pendingLabel="LEAVING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
        touchTarget
        onClick={() => {
          mutation.reset();
          onActionStart("leaving");
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

// ──────────────────────────────────────────────────────────────────────
// F-272 — asking to join a closed group, and answering an invitation.
// Each refreshes the SSR'd page on success, so the next state (Requested,
// Member, nothing) comes from the server.
// ──────────────────────────────────────────────────────────────────────

/** §γ — keyed on err.code (contract §4.7.3 F-272), never err.message. */
export function humanizeJoinRequestError(err: unknown, action: "request" | "cancel" | "answer"): string {
  const generic =
    action === "request"
      ? "You can't join this community."
      : action === "cancel"
        ? "Couldn't cancel your request. Try again."
        : "Couldn't answer this invitation. Try again.";
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to continue.",
      // A ban, a block and the 7-day wait all answer 403; only the wait
      // has its own line (the server's hint covers it on the page).
      bcc_permission_denied: action === "request" ? "You can't ask to join this community right now." : generic,
      // Every caller re-reads on a 409 (the page refreshes, the list
      // refetches), so this states what already happened.
      bcc_conflict: "This changed a moment ago. Showing the latest.",
      bcc_unavailable: "Something went wrong on our side. Nothing changed — try again.",
      bcc_rate_limited: "Too many attempts. Wait a minute and try again.",
      bcc_invalid_request: action === "answer" ? "This invitation is no longer open." : generic,
    },
    generic,
  );
}

/**
 * Refresh on success, and on a 409 too: a conflict means the server's
 * state moved under the viewer, so the page re-reads instead of asking
 * them to reload it. Both tell the strip first (focus, M-gr2): either way
 * the refreshed page may swap the control the viewer pressed.
 */
function useRefreshOnSettle(): { onSuccess: () => void; onError: (err: BccApiError) => void } {
  const router = useRouter();
  const markActed = useContext(MembershipActedContext);
  return {
    onSuccess: () => {
      markActed();
      router.refresh();
    },
    onError: (err) => {
      if (err.code !== "bcc_conflict") return;
      markActed();
      router.refresh();
    },
  };
}

function RequestToJoin({ groupId }: { groupId: number }) {
  const mutation = useRequestJoinGroupMutation(useRefreshOnSettle());
  return (
    <ActionRow primaryCopy="This community is private. Ask to join and a moderator will decide.">
      <GroupActionButton
        groupId={groupId}
        label="REQUEST TO JOIN"
        pendingLabel="SENDING…"
        isPending={mutation.isPending}
        errorMessage={mutation.error ? humanizeJoinRequestError(mutation.error, "request") : null}
        touchTarget
        onClick={() => {
          mutation.reset();
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

function PendingRequest({ groupId }: { groupId: number }) {
  const mutation = useCancelJoinRequestMutation(useRefreshOnSettle());
  return (
    <ActionRow primaryCopy="Your request to join is waiting for a moderator.">
      <GroupActionButton
        groupId={groupId}
        label="CANCEL REQUEST"
        pendingLabel="CANCELLING…"
        isPending={mutation.isPending}
        errorMessage={mutation.error ? humanizeJoinRequestError(mutation.error, "cancel") : null}
        touchTarget
        onClick={() => {
          mutation.reset();
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

/** Shared by the strip and the /communities list, so both confirm the same way. */
export const DECLINE_INVITE_COPY = {
  title: "Decline this invitation?",
  body: (name: string) =>
    `You won't be able to join ${name} unless someone invites you again.`,
  confirm: "DECLINE",
  cancel: "KEEP INVITATION",
  retry: "TRY AGAIN",
} as const;

function InviteAnswer({ groupId, groupName }: { groupId: number; groupName: string }) {
  const settle = useRefreshOnSettle();
  const accept = useAcceptGroupInviteMutation(settle);
  const decline = useDeclineGroupInviteMutation(settle);
  // Declining cannot be undone, and for a secret group the invitation is
  // the only way in, so it confirms first (a mis-tap beside ACCEPT on a
  // phone would otherwise lose access).
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const busy = accept.isPending || decline.isPending;
  return (
    <div className="flex flex-col gap-3">
      <p className="font-serif text-ink-soft" style={{ fontSize: "15px", lineHeight: 1.5, maxWidth: "44ch" }}>
        You&apos;ve been invited to this community.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            accept.reset();
            decline.reset();
            accept.mutate(groupId);
          }}
          disabled={busy}
          className="bcc-mono inline-flex min-h-[44px] items-center border-2 border-bcc-border px-3 text-[11px] tracking-[0.18em] text-bcc-text transition motion-reduce:transition-none hover:border-bcc-border-strong disabled:opacity-60"
        >
          {accept.isPending ? "JOINING…" : "ACCEPT INVITATION"}
        </button>
        <button
          type="button"
          onClick={() => {
            accept.reset();
            decline.reset();
            setConfirmingDecline(true);
          }}
          disabled={busy}
          className="bcc-mono inline-flex min-h-[44px] items-center px-3 text-[11px] tracking-[0.18em] text-bcc-text-secondary hover:text-bcc-text disabled:opacity-60"
        >
          DECLINE
        </button>
      </div>
      {accept.error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-bcc-text-error">
          {humanizeJoinRequestError(accept.error, "answer")}
        </p>
      )}
      {confirmingDecline && (
        <ConfirmDialog
          title={DECLINE_INVITE_COPY.title}
          body={DECLINE_INVITE_COPY.body(groupName)}
          confirmLabel={DECLINE_INVITE_COPY.confirm}
          cancelLabel={DECLINE_INVITE_COPY.cancel}
          retryLabel={DECLINE_INVITE_COPY.retry}
          errorMessage={decline.error ? humanizeJoinRequestError(decline.error, "answer") : null}
          pending={decline.isPending}
          onConfirm={() => {
            decline.reset();
            decline.mutate(groupId, { onSuccess: () => setConfirmingDecline(false) });
          }}
          onCancel={() => {
            decline.reset();
            setConfirmingDecline(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * A polite live region that speaks when the refreshed page changes where
 * the viewer stands: joined or left (F-317 M-gr2; the pill flips silently),
 * and into or out of "requested" (F-272). It is mounted empty and only
 * filled by a CHANGE from the previous render, so a page that loads
 * already-joined or already-requested says nothing; the visible strip copy
 * covers that.
 */
function MembershipAnnouncer({
  membership,
  noun,
}: {
  membership: GroupDetailResponse["viewer_membership"];
  noun: "group" | "Hall";
}) {
  const isMember = membership?.is_member ?? null;
  const status: GroupMembershipStatus | undefined = membership?.status;
  const prev = useRef({ isMember, status });
  const [message, setMessage] = useState("");
  useEffect(() => {
    const before = prev.current;
    prev.current = { isMember, status };
    if (before.isMember === false && isMember === true) setMessage(`You joined this ${noun}.`);
    else if (before.isMember === true && isMember === false) setMessage(`You left this ${noun}.`);
    else if (before.status !== "requested" && status === "requested") {
      setMessage("Request sent. A moderator will decide.");
    } else if (before.status === "requested" && status === "none") setMessage("Request cancelled.");
  }, [isMember, status, noun]);
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}

/**
 * F-388: the owner's / manager's way to the join requests waiting on them.
 * The requests are decided on the Members tab, so from the Stream they
 * were out of sight.
 *
 * It shows only to a viewer who decides (`canManageMembership`, the same
 * gate as the block it links to), and only while the server's
 * `pending_request_count` is above zero. That count is null for everyone
 * else, so nothing is counted on the client. It links the Members tab's
 * "Requests & invitations" block, by anchor.
 */
function PendingRequestsPointer({
  group,
  membersHref,
}: {
  group: GroupDetailResponse;
  membersHref: string;
}) {
  const count = group.pending_request_count;
  if (!canManageMembership(group) || typeof count !== "number" || count <= 0) return null;
  const label = count === 1 ? "1 request waiting" : `${count} requests waiting`;
  return (
    <div className="mt-4">
      <Link
        href={`${membersHref}#${MEMBERSHIP_REQUESTS_ANCHOR}` as Route}
        className="bcc-mono inline-flex min-h-[44px] items-center gap-2 border-2 border-bcc-border px-3 text-[11px] uppercase tracking-[0.18em] text-bcc-text transition motion-reduce:transition-none hover:border-bcc-border-strong"
      >
        {label}
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function ActionRow({
  primaryCopy,
  children,
}: {
  primaryCopy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p
        className="font-serif text-ink-soft"
        style={{ fontSize: "15px", lineHeight: 1.5, maxWidth: "44ch" }}
      >
        {primaryCopy}
      </p>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function UnlockHint({ hint }: { hint: string }) {
  // Server copy is rendered VERBATIM per §A4 / §N7.
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p
        className="font-serif italic text-ink-soft"
        style={{ fontSize: "15px", lineHeight: 1.5, maxWidth: "44ch" }}
      >
        {hint}
      </p>
      <span
        aria-hidden
        className="bcc-mono shrink-0 border-2 border-cardstock-edge px-3 py-1.5 text-ink-ghost"
        style={{ fontSize: "11px", letterSpacing: "0.18em", opacity: 0.6 }}
      >
        LOCKED
      </span>
    </div>
  );
}

/** "For Acme on Osmosis": which validator and chain this group serves. */
function ValidatorServed({ stats }: { stats: GroupValidatorStats }) {
  const chain = stats.chain_name ?? null;
  if (stats.moniker === null && chain === null) return null;
  const name = stats.moniker ?? "this validator";
  return (
    <p
      className="mb-3 font-serif text-ink"
      style={{ fontSize: "15px", lineHeight: 1.5 }}
      data-testid="group-validator-served"
    >
      For{" "}
      {stats.validator_page !== null ? (
        <Link href={stats.validator_page as Route} className="underline">
          {name}
        </Link>
      ) : (
        name
      )}
      {chain !== null && ` on ${chain}`}
    </p>
  );
}

function RestingCopy() {
  return (
    <p
      className="font-serif text-ink-soft"
      style={{ fontSize: "15px", lineHeight: 1.5 }}
    >
      No actions available right now.
    </p>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MembershipPill — GUEST / NOT A MEMBER / MEMBER (cross-kind, no
// ★ PRIMARY because that's a Hall-only concept).
// ──────────────────────────────────────────────────────────────────────

function MembershipPill({
  membership,
  optimisticIntent,
}: {
  membership: GroupDetailResponse["viewer_membership"];
  optimisticIntent: OptimisticIntent;
}) {
  // Predict the post-mutation state so the pill flips the instant the
  // user clicks JOIN/LEAVE instead of after router.refresh() lands.
  // Server response is still authoritative — when the refresh resolves
  // and `membership` updates, the useEffect upstream clears
  // `optimisticIntent` and the pill snaps to truth.
  const isOptimisticMember = optimisticIntent === "joining"
    ? true
    : optimisticIntent === "leaving"
      ? false
      : null;

  const effectiveIsMember = isOptimisticMember ?? membership?.is_member ?? null;

  if (effectiveIsMember === null) {
    return (
      <span
        className="bcc-mono rounded-sm px-2 py-0.5 text-cardstock-deep"
        style={{
          fontSize: "10px",
          letterSpacing: "0.18em",
          background: "rgb(var(--paper-hi-rgb) / 0.06)",
          border: "1px solid rgb(var(--paper-hi-rgb) / 0.18)",
        }}
      >
        GUEST
      </span>
    );
  }
  if (!effectiveIsMember) {
    return (
      <span
        className="bcc-mono rounded-sm px-2 py-0.5 text-cardstock-deep"
        style={{
          fontSize: "10px",
          letterSpacing: "0.18em",
          background: "rgb(var(--paper-hi-rgb) / 0.06)",
          border: "1px solid rgb(var(--paper-hi-rgb) / 0.18)",
        }}
      >
        NOT A MEMBER
      </span>
    );
  }
  return (
    <span
      className="bcc-mono rounded-sm px-2 py-0.5"
      style={{
        fontSize: "10px",
        letterSpacing: "0.18em",
        color: "var(--verified)",
        border: "1px solid rgb(var(--verified-rgb) / 0.32)",
      }}
    >
      MEMBER
    </span>
  );
}
