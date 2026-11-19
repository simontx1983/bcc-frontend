"use client";

/**
 * GroupMembershipAdmin — "Requests & invitations", the owner / manager /
 * site-admin side of closed and secret plain groups (F-272 b, contract
 * §4.7.3 "Join requests and invitations").
 *
 * Mounted at the top of the group page's Members tab. It renders nothing
 * unless the group detail marks the viewer as a decider (D1: owner,
 * manager or site admin; moderators no). Every route it calls answers 403
 * to anyone else, so it never runs a speculative request for an ordinary
 * visitor.
 *
 *   - Pending requests (closed groups): APPROVE (one tap) or DENY. Deny
 *     confirms first: it is silent and the requester may not ask again
 *     for 7 days (D3), so a mis-tap would cost them a week.
 *   - Invite a member: the directory search (`useMembers`, the same one
 *     /messages/new uses). It respects "hide me from member search", so a
 *     member who hides cannot be found here; the hint below the field
 *     says so (user decision 2026-11-17).
 *   - Outstanding invitations: REVOKE (one tap; inviting again undoes it).
 *
 * Copy is keyed on err.code (§γ), with the contract's generic refusals:
 * a refused invitation is always "This member can't be invited.", so a
 * ban and a block read the same.
 */

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/identity/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { SKELETON_CLASS } from "@/components/ui/Skeleton";
import { useMembers } from "@/hooks/useMembers";
import {
  useApproveJoinRequestMutation,
  useDenyJoinRequestMutation,
  useGroupInvites,
  useGroupJoinRequests,
  useInviteToGroupMutation,
  useRevokeGroupInviteMutation,
} from "@/hooks/useMyGroups";
import { humanizeCode } from "@/lib/api/errors";
import {
  BccApiError,
  type GroupDetailResponse,
  type GroupJoinRequestItem,
  type GroupOutstandingInviteItem,
} from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

/**
 * Whether the viewer decides who gets into this group. The server's
 * `can_manage_membership` (closed and secret groups) when present; on a
 * backend without it, `pending_request_count` is non-null for exactly the
 * same viewers, but only on closed groups.
 */
/**
 * F-388 / F-389: the `id` of this block, so a link can land on it:
 * `/communities/{slug}/members#requests`. The owner's strip points here,
 * and so does the server-built link on a `bcc_group_join_requested` bell
 * row. Changing it breaks that link.
 */
export const MEMBERSHIP_REQUESTS_ANCHOR = "requests";

export function canManageMembership(group: GroupDetailResponse): boolean {
  if (typeof group.can_manage_membership === "boolean") return group.can_manage_membership;
  return group.pending_request_count !== null && group.pending_request_count !== undefined;
}

type DecisionAction = "approve" | "deny" | "invite" | "revoke";

/** §γ — keyed on err.code (contract §4.7.3 F-272), never err.message. */
export function humanizeMembershipDecisionError(err: unknown, action: DecisionAction): string {
  const generic: Record<DecisionAction, string> = {
    approve: "Couldn't approve this request. Try again.",
    deny: "Couldn't deny this request. Try again.",
    invite: "Couldn't send the invitation. Try again.",
    revoke: "Couldn't withdraw the invitation. Try again.",
  };
  // An unknown OR suspended account answers the same 404, so the form
  // cannot probe account state; a 400 is an open group or yourself.
  if (action === "invite" && err instanceof BccApiError && err.code === "bcc_invalid_request") {
    return err.status === 404 ? "We couldn't find that member." : "You can't invite this member.";
  }
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to continue.",
      bcc_permission_denied:
        action === "invite"
          ? "This member can't be invited."
          : action === "approve"
            ? "This member can't be approved."
            : "You can't manage who joins this community.",
      // An invite 409 is the person's own state (the search lists members,
      // invitees and requesters alike), not a moved list. Every other
      // decision re-reads its list, so its line states what happened.
      bcc_conflict:
        action === "invite"
          ? "They're already a member, already invited, or have asked to join — check the lists on this page."
          : "This changed a moment ago. Showing the latest.",
      bcc_unavailable: "Something went wrong on our side. Nothing changed — try again.",
      // The invite caps (200 open / 50 a day) share the code; withdrawing
      // an outstanding invitation frees room under the open cap.
      bcc_rate_limited:
        action === "invite"
          ? "Invitation limit reached for now. Try again later, or withdraw some outstanding invitations."
          : "Too many attempts. Wait a minute and try again.",
    },
    generic[action],
  );
}

export function GroupMembershipAdmin({ group }: { group: GroupDetailResponse }) {
  if (!canManageMembership(group)) return null;
  // Requests exist only on closed groups; the server sends the count
  // (non-null) exactly when there is a queue this viewer decides on.
  const takesRequests =
    group.pending_request_count !== null && group.pending_request_count !== undefined;

  return (
    <section
      id={MEMBERSHIP_REQUESTS_ANCHOR}
      aria-labelledby={`membership-admin-${group.id}`}
      className="bcc-panel flex scroll-mt-24 flex-col gap-8 p-5 sm:p-6"
    >
      <header>
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">OWNERS &amp; MANAGERS</span>
        <h2 id={`membership-admin-${group.id}`} className="bcc-stencil mt-1 text-2xl text-bcc-text">
          Requests &amp; invitations
        </h2>
      </header>
      {takesRequests && <JoinRequestsBlock groupId={group.id} />}
      <InvitesBlock groupId={group.id} />
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Pending requests
// ──────────────────────────────────────────────────────────────────────

function JoinRequestsBlock({ groupId }: { groupId: number }) {
  const query = useGroupJoinRequests(groupId, true);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const [done, setDone] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <h3 className="bcc-mono text-[11px] tracking-[0.2em] text-bcc-text">ASKING TO JOIN</h3>
      <p role="status" aria-live="polite" className="sr-only">
        {done}
      </p>
      {query.isPending ? (
        <RowsSkeleton />
      ) : query.isError && query.data === undefined ? (
        <LoadFailure message="Couldn't load join requests." onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <p className="font-serif text-bcc-text-secondary">No one is waiting to join.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bcc-border rounded-sm border border-bcc-border">
          {items.map((item) => (
            <JoinRequestRow key={item.id} groupId={groupId} item={item} onDone={setDone} />
          ))}
        </ul>
      )}
      <MoreButton
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        failed={query.isFetchNextPageError}
        onMore={() => void query.fetchNextPage()}
        failure="Couldn't load more requests."
      />
    </div>
  );
}

function JoinRequestRow({
  groupId,
  item,
  onDone,
}: {
  groupId: number;
  item: GroupJoinRequestItem;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const name = displayName(item.display_name, item.handle);
  const approve = useApproveJoinRequestMutation();
  const deny = useDenyJoinRequestMutation();
  const [confirmingDeny, setConfirmingDeny] = useState(false);
  const busy = approve.isPending || deny.isPending;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      <PersonCell handle={item.handle} name={name} avatarUrl={item.avatar_url} meta={`Asked ${formatRelativeTime(item.requested_at)}`} />
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            approve.reset();
            deny.reset();
            approve.mutate(
              { groupId, userId: item.id },
              {
                onSuccess: () => {
                  onDone(`${name} is now a member.`);
                  // The page's request count and roster are server-rendered.
                  router.refresh();
                },
              },
            );
          }}
          aria-label={`Approve ${name}`}
          className={PRIMARY_BUTTON}
        >
          {approve.isPending ? "APPROVING…" : "APPROVE"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            approve.reset();
            deny.reset();
            setConfirmingDeny(true);
          }}
          aria-label={`Deny ${name}`}
          className={QUIET_BUTTON}
        >
          DENY
        </button>
      </div>
      {approve.error !== null && (
        <p role="alert" className="bcc-mono w-full text-[11px] text-bcc-text-error">
          {humanizeMembershipDecisionError(approve.error, "approve")}
        </p>
      )}
      {confirmingDeny && (
        <ConfirmDialog
          title="Deny this request?"
          body={`${name} won't be told, and can't ask to join again for 7 days.`}
          confirmLabel="DENY"
          cancelLabel="KEEP REQUEST"
          retryLabel="TRY AGAIN"
          errorMessage={deny.error ? humanizeMembershipDecisionError(deny.error, "deny") : null}
          pending={deny.isPending}
          onConfirm={() => {
            deny.reset();
            deny.mutate(
              { groupId, userId: item.id },
              {
                onSuccess: () => {
                  setConfirmingDeny(false);
                  onDone(`Request from ${name} denied.`);
                  router.refresh();
                },
              },
            );
          }}
          onCancel={() => {
            deny.reset();
            setConfirmingDeny(false);
          }}
        />
      )}
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Invitations
// ──────────────────────────────────────────────────────────────────────

function InvitesBlock({ groupId }: { groupId: number }) {
  const query = useGroupInvites(groupId, true);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="bcc-mono text-[11px] tracking-[0.2em] text-bcc-text">INVITE A MEMBER</h3>
      <InvitePicker groupId={groupId} />

      <h3 className="bcc-mono mt-3 text-[11px] tracking-[0.2em] text-bcc-text">OUTSTANDING INVITATIONS</h3>
      {query.isPending ? (
        <RowsSkeleton />
      ) : query.isError && query.data === undefined ? (
        <LoadFailure message="Couldn't load invitations." onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <p className="font-serif text-bcc-text-secondary">No outstanding invitations.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bcc-border rounded-sm border border-bcc-border">
          {items.map((item) => (
            <OutstandingInviteRow key={item.id} groupId={groupId} item={item} />
          ))}
        </ul>
      )}
      <MoreButton
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        failed={query.isFetchNextPageError}
        onMore={() => void query.fetchNextPage()}
        failure="Couldn't load more invitations."
      />
    </div>
  );
}

const SEARCH_MIN = 2;
const SEARCH_PAGE = 8;

function InvitePicker({ groupId }: { groupId: number }) {
  const session = useSession();
  const ownHandle = session.data?.user?.handle ?? null;
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [invited, setInvited] = useState<Record<number, true>>({});
  const [done, setDone] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const searching = q.length >= SEARCH_MIN;
  const results = useMembers({ page: 1, perPage: SEARCH_PAGE, q, enabled: searching });
  // Your own card: nothing to invite.
  const people = (results.data?.items ?? []).filter((m) => m.handle !== ownHandle);
  const hintId = `invite-hint-${groupId}`;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="bcc-mono text-[11px] text-bcc-text-secondary">Find a member by name or handle</span>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-describedby={hintId}
          autoComplete="off"
          className="min-h-[44px] border border-bcc-input-border bg-bcc-input-bg px-3 text-bcc-text outline-none focus:border-bcc-accent"
        />
      </label>
      <p id={hintId} className="bcc-mono text-[10px] leading-snug text-bcc-text-secondary">
        Members who hide themselves from member search can&apos;t be found here.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {done}
      </p>
      {searching &&
        (results.isPending ? (
          <p className="bcc-mono text-[11px] text-bcc-text-secondary">Searching…</p>
        ) : results.isError ? (
          <LoadFailure message="Couldn't search members." onRetry={() => void results.refetch()} />
        ) : people.length === 0 ? (
          <p className="font-serif text-bcc-text-secondary">No members match.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-bcc-border rounded-sm border border-bcc-border">
            {people.map((m) => (
              <InviteCandidateRow
                key={m.id}
                groupId={groupId}
                userId={m.id}
                handle={m.handle}
                name={displayName(m.name, m.handle)}
                avatarUrl={m.crest.image_url}
                invited={invited[m.id] === true}
                onInvited={(name) => {
                  setInvited((prev) => ({ ...prev, [m.id]: true }));
                  setDone(`Invitation sent to ${name}.`);
                }}
              />
            ))}
          </ul>
        ))}
    </div>
  );
}

function InviteCandidateRow({
  groupId,
  userId,
  handle,
  name,
  avatarUrl,
  invited,
  onInvited,
}: {
  groupId: number;
  userId: number;
  handle: string;
  name: string;
  avatarUrl: string | null;
  invited: boolean;
  onInvited: (name: string) => void;
}) {
  const invite = useInviteToGroupMutation();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      <PersonCell handle={handle} name={name} avatarUrl={avatarUrl} meta={`@${handle}`} />
      <button
        type="button"
        disabled={invite.isPending || invited}
        onClick={() => {
          invite.reset();
          invite.mutate({ groupId, userId }, { onSuccess: () => onInvited(name) });
        }}
        aria-label={invited ? `Invited ${name}` : `Invite ${name}`}
        className={PRIMARY_BUTTON}
      >
        {invited ? "INVITED" : invite.isPending ? "INVITING…" : "INVITE"}
      </button>
      {invite.error !== null && (
        <p role="alert" className="bcc-mono w-full text-[11px] text-bcc-text-error">
          {humanizeMembershipDecisionError(invite.error, "invite")}
        </p>
      )}
    </li>
  );
}

function OutstandingInviteRow({ groupId, item }: { groupId: number; item: GroupOutstandingInviteItem }) {
  const revoke = useRevokeGroupInviteMutation();
  const name = displayName(item.display_name, item.handle);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      <PersonCell handle={item.handle} name={name} avatarUrl={item.avatar_url} meta={`Invited ${formatRelativeTime(item.invited_at)}`} />
      <button
        type="button"
        disabled={revoke.isPending}
        onClick={() => {
          revoke.reset();
          // One tap: inviting again undoes it. The list re-reads on settle.
          revoke.mutate({ groupId, userId: item.id });
        }}
        aria-label={`Revoke the invitation to ${name}`}
        className={QUIET_BUTTON}
      >
        {revoke.isPending ? "REVOKING…" : "REVOKE"}
      </button>
      {revoke.error !== null && (
        <p role="alert" className="bcc-mono w-full text-[11px] text-bcc-text-error">
          {humanizeMembershipDecisionError(revoke.error, "revoke")}
        </p>
      )}
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared bits
// ──────────────────────────────────────────────────────────────────────

const PRIMARY_BUTTON =
  "bcc-mono inline-flex min-h-[44px] items-center border-2 border-bcc-border px-3 text-[11px] tracking-[0.18em] text-bcc-text hover:border-bcc-border-strong disabled:opacity-60";
const QUIET_BUTTON =
  "bcc-mono inline-flex min-h-[44px] items-center px-3 text-[11px] tracking-[0.18em] text-bcc-text-secondary hover:text-bcc-text disabled:opacity-60";

function displayName(name: string, handle: string): string {
  return name !== "" ? name : `@${handle}`;
}

function PersonCell({
  handle,
  name,
  avatarUrl,
  meta,
}: {
  handle: string;
  name: string;
  avatarUrl: string | null;
  meta: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar avatarUrl={avatarUrl} handle={handle} displayName={name} size="sm" variant="rounded" />
      <div className="min-w-0">
        <Link href={`/u/${handle}` as Route} className="block truncate text-sm text-bcc-text hover:underline">
          {name}
        </Link>
        <p className="bcc-mono truncate text-[10px] tracking-[0.16em] text-bcc-text-secondary">{meta}</p>
      </div>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className={`${SKELETON_CLASS} h-14`} />
      <div className={`${SKELETON_CLASS} h-14`} />
    </div>
  );
}

function MoreButton({
  hasNextPage,
  isFetchingNextPage,
  failed,
  onMore,
  failure,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  failed: boolean;
  onMore: () => void;
  failure: string;
}) {
  // A failed next page withdraws SHOW MORE (so it can't skip that page);
  // Retry re-requests the same page.
  if (failed) return <LoadFailure message={failure} onRetry={onMore} />;
  if (!hasNextPage) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (!isFetchingNextPage) onMore();
      }}
      disabled={isFetchingNextPage}
      className={`${PRIMARY_BUTTON} self-start`}
    >
      {isFetchingNextPage ? "LOADING…" : "SHOW MORE"}
    </button>
  );
}
