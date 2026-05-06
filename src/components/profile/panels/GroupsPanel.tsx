"use client";

/**
 * GroupsPanel — §4.7.2 Profile Groups Tab.
 *
 * Cross-kind list (holder / Local / plain user / system) of all groups
 * the target user is an active member of. Server-side privacy filter
 * drops secret groups for non-self viewers; closed groups always appear
 * with name + member_count visible.
 *
 * Per-row actions: rendered from the server's `permissions{}` block per
 * §A4 / §N7. Precedence is leave > join > unlock_hint > nothing:
 *   - Self profile → `can_leave.allowed = true` for every row → LEAVE.
 *   - Other profile + viewer eligible → `can_join.allowed = true` → JOIN.
 *   - Other profile + viewer ineligible → render the server's
 *     `unlock_hint` verbatim (e.g. "Hold an NFT…", "Visit the group
 *     page to request to join.").
 *
 * Action dispatch (V1 hardcoded paths, per contract §3.3 line 770):
 *   - type === "nft"             → useJoin/LeaveHolderGroupMutation
 *   - type === "local"           → useJoin/LeaveLocalMutation
 *   - type === "user" | "system" → useJoin/LeavePlainGroupMutation
 *
 * On success we invalidate `USER_GROUPS_QUERY_KEY_ROOT` so the panel
 * re-fetches with fresh permissions (and, on self-profile leave, the
 * row drops out of the bucket entirely). We do NOT call router.refresh
 * — the parent `/u/[handle]` page is server-rendered but its content
 * doesn't depend on the user's group memberships beyond this panel.
 */

import { useQueryClient } from "@tanstack/react-query";

import { GroupActionButton } from "@/components/groups/GroupActionButton";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
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
import {
  USER_GROUPS_QUERY_KEY_ROOT,
  useUserGroups,
} from "@/hooks/useUserActivity";
import type { UserGroupItem } from "@/lib/api/types";

interface GroupsPanelProps {
  handle: string;
}

export function GroupsPanel({ handle }: GroupsPanelProps) {
  const query = useUserGroups(handle);

  if (query.isPending) {
    return (
      <article className="bcc-paper">
        <Header />
        <div className="px-8 py-12">
          <p className="bcc-mono text-ink-soft">Loading groups…</p>
        </div>
      </article>
    );
  }

  if (query.isError) {
    return (
      <article className="bcc-paper">
        <Header />
        <div className="px-8 py-12">
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load groups: {query.error.message}
          </p>
        </div>
      </article>
    );
  }

  const items = query.data.items;

  return (
    <article className="bcc-paper">
      <Header />
      {items.length === 0 ? (
        <GroupsEmpty />
      ) : (
        <ul>
          {items.map((item) => (
            <li
              key={item.group_id}
              className="border-b border-dashed border-ink/22 px-5 py-4 last:border-b-0"
            >
              <GroupRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Per-row layout — kind kicker + name + meta strip on the left; action
// area on the right (button OR unlock_hint OR nothing).
// ──────────────────────────────────────────────────────────────────────

function GroupRow({ item }: { item: UserGroupItem }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex flex-col gap-1">
        <div
          className="bcc-mono uppercase text-ink-ghost"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          {item.type_label}
        </div>
        <div
          className="bcc-stencil text-ink"
          style={{ fontSize: "17px", letterSpacing: "0.02em", lineHeight: 1.1 }}
        >
          {item.name}
        </div>
        <div
          className="bcc-mono mt-2 flex flex-wrap items-center gap-3 text-ink-ghost"
          style={{ fontSize: "9px", letterSpacing: "0.14em" }}
        >
          <span>
            {item.member_count.toLocaleString()} MEMBER{item.member_count === 1 ? "" : "S"}
          </span>
          {item.privacy === "closed" && (
            <span aria-label="Closed group" className="text-safety">
              · CLOSED
            </span>
          )}
          {item.verification !== null && (
            <>
              <span aria-hidden>·</span>
              <VerificationBadge label={item.verification.label} />
            </>
          )}
        </div>
      </div>
      <div className="shrink-0">
        <GroupRowActions item={item} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Action precedence — leave > join > unlock_hint > nothing.
// Each branch dispatches to a per-type wrapper that owns its mutation
// hook. We can't switch on `type` inside a single component because
// hooks can't be conditional, so each wrapper component calls only
// the hook(s) for its kind.
// ──────────────────────────────────────────────────────────────────────

function GroupRowActions({ item }: { item: UserGroupItem }) {
  const { permissions } = item;

  if (permissions.can_leave.allowed) {
    return <LeaveAction item={item} />;
  }
  if (permissions.can_join.allowed) {
    return <JoinAction item={item} />;
  }
  if (permissions.can_join.unlock_hint !== null) {
    return <UnlockHint hint={permissions.can_join.unlock_hint} />;
  }
  return null;
}

function JoinAction({ item }: { item: UserGroupItem }) {
  switch (item.type) {
    case "nft":
      return <HolderJoinButton groupId={item.group_id} />;
    case "local":
      return <LocalJoinButton groupId={item.group_id} />;
    case "user":
    case "system":
      return <PlainJoinButton groupId={item.group_id} />;
  }
}

function LeaveAction({ item }: { item: UserGroupItem }) {
  switch (item.type) {
    case "nft":
      return <HolderLeaveButton groupId={item.group_id} />;
    case "local":
      return <LocalLeaveButton groupId={item.group_id} />;
    case "user":
    case "system":
      return <PlainLeaveButton groupId={item.group_id} />;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Per-type wrappers. Each binds one mutation hook to GroupActionButton
// and invalidates the user-groups query on success so the panel
// re-fetches with fresh permissions / membership state.
// ──────────────────────────────────────────────────────────────────────

function useInvalidateUserGroups(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: USER_GROUPS_QUERY_KEY_ROOT });
  };
}

function HolderJoinButton({ groupId }: { groupId: number }) {
  const onSuccess = useInvalidateUserGroups();
  const mutation = useJoinHolderGroupMutation({ onSuccess });
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

function HolderLeaveButton({ groupId }: { groupId: number }) {
  const onSuccess = useInvalidateUserGroups();
  const mutation = useLeaveHolderGroupMutation({ onSuccess });
  return (
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
  );
}

function LocalJoinButton({ groupId }: { groupId: number }) {
  const onSuccess = useInvalidateUserGroups();
  const mutation = useJoinLocalMutation({ onSuccess });
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

function LocalLeaveButton({ groupId }: { groupId: number }) {
  const onSuccess = useInvalidateUserGroups();
  const mutation = useLeaveLocalMutation({ onSuccess });
  return (
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
  );
}

function PlainJoinButton({ groupId }: { groupId: number }) {
  const onSuccess = useInvalidateUserGroups();
  const mutation = useJoinPlainGroupMutation({ onSuccess });
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

function PlainLeaveButton({ groupId }: { groupId: number }) {
  const onSuccess = useInvalidateUserGroups();
  const mutation = useLeavePlainGroupMutation({ onSuccess });
  return (
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
  );
}

// ──────────────────────────────────────────────────────────────────────
// UnlockHint — server's `permissions.can_join.unlock_hint` rendered
// verbatim per §A4 / §N7. Frontend never substitutes a generic string.
// ──────────────────────────────────────────────────────────────────────

function UnlockHint({ hint }: { hint: string }) {
  return (
    <p
      className="bcc-mono max-w-[14rem] text-right text-ink-soft"
      style={{ fontSize: "10px", letterSpacing: "0.12em" }}
    >
      {hint}
    </p>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Header / Empty — kind kicker now reads `item.type_label` verbatim
// from the server (per §A2 / §S); see [docs/api-contract-v1.md §4.7.2].
// ──────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="bcc-paper-head">
      <h3 className="bcc-stencil" style={{ fontSize: "16px", letterSpacing: "0.18em" }}>
        Groups on file
      </h3>
      <span className="bcc-mono text-weld" style={{ fontSize: "9px" }}>
        ACTIVE MEMBERSHIPS
      </span>
    </header>
  );
}

function GroupsEmpty() {
  return (
    <div className="px-8 py-12">
      <p
        className="bcc-mono mb-3 text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        NOTHING ON FILE
      </p>
      <h4
        className="bcc-stencil text-ink"
        style={{ fontSize: "26px", letterSpacing: "0.02em", lineHeight: 1.05 }}
      >
        No groups joined.
      </h4>
      <p
        className="font-serif italic text-ink-soft"
        style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "560px", marginTop: "10px" }}
      >
        When this member joins a community &mdash; Local, holder group, or
        otherwise &mdash; it lands here as a record of where they show up.
      </p>
    </div>
  );
}
