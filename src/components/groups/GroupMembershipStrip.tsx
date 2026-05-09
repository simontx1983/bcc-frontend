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
import type { GroupDetailResponse } from "@/lib/api/types";

interface GroupMembershipStripProps {
  group: GroupDetailResponse;
}

export function GroupMembershipStrip({ group }: GroupMembershipStripProps) {
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
        <MembershipPill membership={group.viewer_membership} />
      </header>

      <div className="px-6 py-5">
        <MembershipBody group={group} />
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Body — branches on `permissions` to render leave / join / hint /
// nothing per §A4 / §N7 precedence.
// ──────────────────────────────────────────────────────────────────────

function MembershipBody({ group }: { group: GroupDetailResponse }) {
  const { permissions } = group;

  if (permissions.can_leave.allowed) {
    return <LeaveAction group={group} />;
  }
  if (permissions.can_join.allowed) {
    return <JoinAction group={group} />;
  }
  if (permissions.can_join.unlock_hint !== null) {
    return <UnlockHint hint={permissions.can_join.unlock_hint} />;
  }
  return <RestingCopy />;
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

function JoinAction({ group }: { group: GroupDetailResponse }) {
  switch (group.type) {
    case "nft":
      return <HolderJoinButton groupId={group.id} />;
    case "local":
      return <LocalJoinButton groupId={group.id} />;
    case "user":
    case "system":
      return <PlainJoinButton groupId={group.id} />;
  }
}

function LeaveAction({ group }: { group: GroupDetailResponse }) {
  switch (group.type) {
    case "nft":
      return <HolderLeaveButton groupId={group.id} />;
    case "local":
      return <LocalLeaveButton groupId={group.id} />;
    case "user":
    case "system":
      return <PlainLeaveButton groupId={group.id} />;
  }
}

function useRefreshOnSuccess(): () => void {
  const router = useRouter();
  return () => router.refresh();
}

function HolderJoinButton({ groupId }: { groupId: number }) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useJoinHolderGroupMutation({ onSuccess });
  return (
    <ActionRow primaryCopy="Join the group to read its feed and post inside it.">
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
    </ActionRow>
  );
}

function HolderLeaveButton({ groupId }: { groupId: number }) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useLeaveHolderGroupMutation({ onSuccess });
  return (
    <ActionRow primaryCopy="You're an active member. Posts you make here scope to this group's feed.">
      <GroupActionButton
        groupId={groupId}
        label="LEAVE"
        pendingLabel="LEAVING…"
        isPending={mutation.isPending}
        errorMessage={mutation.error?.message ?? null}
        onClick={() => {
          mutation.reset();
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

function LocalJoinButton({ groupId }: { groupId: number }) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useJoinLocalMutation({ onSuccess });
  return (
    <ActionRow primaryCopy="Join the group to read its feed and post inside it.">
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
    </ActionRow>
  );
}

function LocalLeaveButton({ groupId }: { groupId: number }) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useLeaveLocalMutation({ onSuccess });
  return (
    <ActionRow primaryCopy="You're an active member of this Local.">
      <GroupActionButton
        groupId={groupId}
        label="LEAVE"
        pendingLabel="LEAVING…"
        isPending={mutation.isPending}
        errorMessage={mutation.error?.message ?? null}
        onClick={() => {
          mutation.reset();
          mutation.mutate(groupId);
        }}
      />
    </ActionRow>
  );
}

function PlainJoinButton({ groupId }: { groupId: number }) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useJoinPlainGroupMutation({ onSuccess });
  return (
    <ActionRow primaryCopy="Join the group to read its feed and post inside it.">
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
    </ActionRow>
  );
}

function PlainLeaveButton({ groupId }: { groupId: number }) {
  const onSuccess = useRefreshOnSuccess();
  const mutation = useLeavePlainGroupMutation({ onSuccess });
  return (
    <ActionRow primaryCopy="You're an active member.">
      <GroupActionButton
        groupId={groupId}
        label="LEAVE"
        pendingLabel="LEAVING…"
        isPending={mutation.isPending}
        errorMessage={mutation.error?.message ?? null}
        onClick={() => {
          mutation.reset();
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
}: {
  membership: GroupDetailResponse["viewer_membership"];
}) {
  if (membership === null) {
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
  if (!membership.is_member) {
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
