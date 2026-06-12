"use client";

/**
 * GroupMembershipStrip — the "your status here" panel on the §4.7.5
 * group-detail page. Cross-kind: works for nft / local / system / user
 * groups via the same kind-dispatched wrapper pattern that
 * `components/profile/panels/GroupsPanel.tsx` uses.
 *
 * Action precedence (matches GroupsPanel exactly per §A4 / §N7):
 *   1. permissions.can_leave.allowed → LEAVE button
 *   2. permissions.can_join.allowed  → JOIN button
 *   3. permissions.can_join.unlock_hint !== null → render hint verbatim
 *   4. otherwise → no action surface
 *
 * On success → `router.refresh()` re-fetches the parent server component
 * (the page is SSR'd). This matches `LocalMembershipControls` and is
 * simpler than React-Query cache surgery for an SSR'd parent.
 *
 * The frontend does NOT recompute eligibility — the server's
 * `permissions{}` block is the single source of truth (§A2).
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { GroupActionButton } from "@/components/groups/GroupActionButton";
import {
  useJoinHolderGroupMutation,
  useLeaveHolderGroupMutation,
} from "@/hooks/useHolderGroups";
import {
  useJoinLocalMutation,
  useLeaveLocalMutation,
} from "@/hooks/useLocalsPrimary";
import {
  useJoinPlainGroupMutation,
  useLeavePlainGroupMutation,
} from "@/hooks/useMyGroups";
import { useLinkWalletMutation, useMyWallets } from "@/hooks/useWallets";
import type { GroupDetailResponse } from "@/lib/api/types";
import { isAllowed, reasonCode, unlockHint } from "@/lib/permissions";
import { findWalletChain } from "@/lib/wallet/chain-catalog";
import { humanizeCode } from "@/lib/api/errors";
import { humanizeLinkError } from "@/lib/wallet/linkFlow";

interface GroupMembershipStripProps {
  group: GroupDetailResponse;
}

/**
 * §γ — join/leave failures render the returned string inline; copy is
 * keyed on err.code, never err.message. `verb` is "join" | "leave".
 *
 * Exported for reuse by CommunityJoinCard (the community trading card
 * joins through the same three mutations and must speak the same
 * copy).
 */
export function humanizeMembershipError(err: unknown, verb: "join" | "leave"): string {
  return humanizeCode(
    err,
    {
      bcc_rate_limited: `Slow down — too many ${verb} attempts. Wait a minute.`,
      bcc_unauthorized: `Sign in to ${verb} this group.`,
      bcc_permission_denied: "You don't meet this group's requirements yet.",
    },
    `Couldn't ${verb} this group. Try again.`,
  );
}

/**
 * Optimistic intent recorded the instant a join/leave action fires —
 * lets the pill predict the post-mutation state and skip the ~500ms
 * `router.refresh()` round-trip flicker. Reset to null on action error
 * so a failed mutation snaps back to the server-truthful pill.
 */
type OptimisticIntent = "joining" | "leaving" | null;

export function GroupMembershipStrip({ group }: GroupMembershipStripProps) {
  const [optimisticIntent, setOptimisticIntent] = useState<OptimisticIntent>(null);

  // When the server-supplied membership changes (router.refresh landed),
  // the in-flight optimistic prediction has been replaced with truth —
  // clear it so a future action starts from a clean state.
  useEffect(() => {
    setOptimisticIntent(null);
  }, [group.viewer_membership]);

  return (
    <article
      className="bcc-paper bcc-stage-reveal"
      style={{ ["--stagger" as string]: "100ms" }}
    >
      <header className="bcc-paper-head">
        <h3
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

      <div className="px-6 py-5">
        <MembershipBody
          group={group}
          onActionStart={setOptimisticIntent}
          onActionError={() => setOptimisticIntent(null)}
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
    return <UnlockHint hint={leaveHint} />;
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
    case "local":
      return <LocalJoinButton groupId={group.id} {...handlers} />;
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
    case "local":
      return <LocalLeaveButton groupId={group.id} {...handlers} />;
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

function useRefreshOnSuccess(): () => void {
  const router = useRouter();
  return () => router.refresh();
}

function HolderJoinButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useJoinHolderGroupMutation({ onSuccess, onError: onActionError });
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "join")
    : null;
  return (
    <ActionRow primaryCopy="Join the group to read its feed and post inside it.">
      <GroupActionButton
        groupId={groupId}
        label="JOIN"
        pendingLabel="JOINING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
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
  const joinErrorMessage = join.error
    ? humanizeMembershipError(join.error, "join")
    : null;
  const errorMessage = link.error ? humanizeLinkError(link.error) : joinErrorMessage;

  // No verified wallet on the group's chain → connect one inline, then join.
  if (noMatchingWallet && canConnect) {
    return (
      <ActionRow primaryCopy={`Connect a ${chainOpt.label} wallet to verify you hold this NFT.`}>
        <GroupActionButton
          groupId={group.id}
          label="CONNECT WALLET & VERIFY"
          pendingLabel={connectLabel}
          isPending={busy}
          errorMessage={errorMessage}
          onClick={() => {
            void connectAndJoin();
          }}
        />
      </ActionRow>
    );
  }

  // Has a wallet on the chain (or we couldn't determine) → CHECK & JOIN against
  // the already-linked wallet (no signature). If it comes back not-eligible,
  // offer a secondary "connect another wallet" so a user holding the NFT in an
  // unlinked wallet can link it and retry.
  const hint =
    unlockHint(group.permissions, "can_join") ??
    "Hold an NFT from this collection to join.";
  const showConnectAnother =
    canConnect && join.error !== null && join.error.code !== "bcc_rate_limited" && !busy;
  return (
    <div className="flex flex-col gap-3">
      <ActionRow primaryCopy={hint}>
        <GroupActionButton
          groupId={group.id}
          label="CHECK & JOIN"
          pendingLabel={busy ? connectLabel : "CHECKING…"}
          isPending={busy}
          errorMessage={errorMessage}
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
            className="bcc-mono inline-flex shrink-0 items-center border-2 border-cardstock-edge px-3 py-1.5 text-[11px] tracking-[0.18em] text-ink-soft transition motion-reduce:transition-none hover:border-ink/50 hover:text-ink disabled:opacity-60"
          >
            CONNECT ANOTHER WALLET
          </button>
        </div>
      )}
    </div>
  );
}

function HolderLeaveButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useLeaveHolderGroupMutation({ onSuccess, onError: onActionError });
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "leave")
    : null;
  return (
    <ActionRow primaryCopy="You're an active member. Posts you make here scope to this group's feed.">
      <GroupActionButton
        groupId={groupId}
        label="LEAVE"
        pendingLabel="LEAVING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
        onClick={() => {
          mutation.reset();
          onActionStart("leaving");
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

function LocalJoinButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useJoinLocalMutation({ onSuccess, onError: onActionError });
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "join")
    : null;
  return (
    <ActionRow primaryCopy="Join the group to read its feed and post inside it.">
      <GroupActionButton
        groupId={groupId}
        label="JOIN"
        pendingLabel="JOINING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
        onClick={() => {
          mutation.reset();
          onActionStart("joining");
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

function LocalLeaveButton({ groupId, onActionStart, onActionError }: ActionButtonProps) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useLeaveLocalMutation({ onSuccess, onError: onActionError });
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "leave")
    : null;
  return (
    <ActionRow primaryCopy="You're an active member of this Local.">
      <GroupActionButton
        groupId={groupId}
        label="LEAVE"
        pendingLabel="LEAVING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
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
  const onSuccess = useRefreshOnSuccess();
  const mutation = useJoinPlainGroupMutation({ onSuccess, onError: onActionError });
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "join")
    : null;
  return (
    <ActionRow primaryCopy="Join the group to read its feed and post inside it.">
      <GroupActionButton
        groupId={groupId}
        label="JOIN"
        pendingLabel="JOINING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
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
  const onSuccess = useRefreshOnSuccess();
  const mutation = useLeavePlainGroupMutation({ onSuccess, onError: onActionError });
  const errorMessage = mutation.error
    ? humanizeMembershipError(mutation.error, "leave")
    : null;
  return (
    <ActionRow primaryCopy="You're an active member.">
      <GroupActionButton
        groupId={groupId}
        label="LEAVE"
        pendingLabel="LEAVING…"
        isPending={mutation.isPending}
        errorMessage={errorMessage}
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
// ★ PRIMARY because that's a Local-only concept).
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
          background: "rgba(255,250,242,0.06)",
          border: "1px solid rgba(255,250,242,0.18)",
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
          background: "rgba(255,250,242,0.06)",
          border: "1px solid rgba(255,250,242,0.18)",
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
        background: "rgba(44,157,102,0.10)",
        border: "1px solid rgba(44,157,102,0.32)",
      }}
    >
      MEMBER
    </span>
  );
}
