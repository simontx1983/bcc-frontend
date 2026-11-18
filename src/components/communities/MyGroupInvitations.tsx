"use client";

/**
 * MyGroupInvitations — the communities the signed-in member has been
 * invited to (F-272, GET /me/group-invites).
 *
 * The bcc_group_invited bell item opens the group's own page, which
 * carries Accept / Decline in its membership strip (user decision
 * 2026-11-13). This list is the second way in: every open invitation in
 * one place on /communities, so a secret group (absent from discovery) is
 * still findable after the bell item is gone. Self-contained: placing it
 * is one line.
 *
 * Renders nothing while loading and when there are no invitations (an
 * empty "Invitations" block would be noise on a discovery page). A failed
 * first read says so with Retry rather than pretending there are none; a
 * failed REFETCH keeps what is already on screen.
 */

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DECLINE_INVITE_COPY,
  humanizeJoinRequestError,
} from "@/components/groups/GroupMembershipStrip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadFailure } from "@/components/ui/LoadFailure";
import {
  useAcceptGroupInviteMutation,
  useDeclineGroupInviteMutation,
  useMyGroupInvites,
} from "@/hooks/useMyGroups";
import type { MyGroupInvite } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

export function MyGroupInvitations() {
  const invites = useMyGroupInvites();
  const [joined, setJoined] = useState<MyGroupInvite[]>([]);

  // Accepting refetches the list, which drops that invitation; the
  // confirmation is kept here so it does not vanish with its row — nor
  // when that refetch fails.
  const joinedIds = new Set(joined.map((j) => j.group.id));
  const open = (invites.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (i) => !joinedIds.has(i.group.id),
  );
  // Only a read that never produced data is a failure worth a block of
  // its own; React Query keeps the last good pages through a failed refetch.
  const failedFirstRead = invites.isError && invites.data === undefined;
  if (open.length === 0 && joined.length === 0 && !failedFirstRead) return null;

  return (
    <section aria-labelledby="my-invitations-heading" className="mx-auto mt-8 max-w-[1440px] px-6 sm:px-8">
      <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">FOR YOU</span>
      <h2 id="my-invitations-heading" className="bcc-stencil mt-1 text-2xl text-bcc-text">
        Your invitations
      </h2>
      {(joined.length > 0 || open.length > 0) && (
        <ul className="mt-3 flex flex-col gap-3">
          {joined.map((invite) => (
            <JoinedRow key={invite.group.id} invite={invite} />
          ))}
          {open.map((invite) => (
            <InvitationRow
              key={invite.group.id}
              invite={invite}
              onJoined={() => setJoined((prev) => [...prev, invite])}
            />
          ))}
        </ul>
      )}
      {failedFirstRead && (
        <div className="mt-3">
          <LoadFailure message="Couldn't load your invitations." onRetry={() => void invites.refetch()} />
        </div>
      )}
      {invites.hasNextPage && (
        <button
          type="button"
          onClick={() => void invites.fetchNextPage()}
          disabled={invites.isFetchingNextPage}
          className="bcc-mono mt-3 inline-flex min-h-[44px] items-center border-2 border-bcc-border px-3 text-[11px] tracking-[0.18em] text-bcc-text-secondary hover:border-bcc-border-strong hover:text-bcc-text disabled:opacity-60"
        >
          {invites.isFetchingNextPage ? "LOADING…" : "SHOW MORE"}
        </button>
      )}
    </section>
  );
}

function JoinedRow({ invite }: { invite: MyGroupInvite }) {
  const { group } = invite;
  return (
    <li className="bcc-panel p-4">
      <p role="status" className="font-serif text-bcc-text">
        You joined{" "}
        <Link href={group.links.self as Route} className="underline">
          {group.name}
        </Link>
        .
      </p>
    </li>
  );
}

function InvitationRow({ invite, onJoined }: { invite: MyGroupInvite; onJoined: () => void }) {
  const router = useRouter();
  const accept = useAcceptGroupInviteMutation();
  const decline = useDeclineGroupInviteMutation();
  // Declining cannot be undone, and for a secret group the invitation is
  // the only way in — it confirms first, exactly as on the group page.
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const busy = accept.isPending || decline.isPending;
  const { group } = invite;
  const by = invite.invited_by;

  return (
    <li className="bcc-panel flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <Link href={group.links.self as Route} className="font-serif text-lg text-bcc-text underline-offset-2 hover:underline">
          {group.name}
        </Link>
        <p className="bcc-mono mt-1 text-[11px] text-bcc-text-secondary">
          {by !== null ? `Invited by @${by.handle}` : "You were invited"} · {formatRelativeTime(invite.invited_at)}
        </p>
        {accept.error !== null && (
          <p role="alert" className="bcc-mono mt-1 text-[11px] text-bcc-text-error">
            {humanizeJoinRequestError(accept.error, "answer")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            accept.reset();
            decline.reset();
            accept.mutate(group.id, {
              onSuccess: () => {
                onJoined();
                // The page's server-rendered membership lists are now stale.
                router.refresh();
              },
            });
          }}
          aria-label={`Accept the invitation to ${group.name}`}
          className="bcc-mono inline-flex min-h-[44px] items-center border-2 border-bcc-border px-3 text-[11px] tracking-[0.18em] text-bcc-text hover:border-bcc-border-strong disabled:opacity-60"
        >
          {accept.isPending ? "JOINING…" : "ACCEPT"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            accept.reset();
            decline.reset();
            setConfirmingDecline(true);
          }}
          aria-label={`Decline the invitation to ${group.name}`}
          className="bcc-mono inline-flex min-h-[44px] items-center px-3 text-[11px] tracking-[0.18em] text-bcc-text-secondary hover:text-bcc-text disabled:opacity-60"
        >
          DECLINE
        </button>
      </div>
      {confirmingDecline && (
        <ConfirmDialog
          title={DECLINE_INVITE_COPY.title}
          body={DECLINE_INVITE_COPY.body(group.name)}
          confirmLabel={DECLINE_INVITE_COPY.confirm}
          cancelLabel={DECLINE_INVITE_COPY.cancel}
          retryLabel={DECLINE_INVITE_COPY.retry}
          errorMessage={decline.error ? humanizeJoinRequestError(decline.error, "answer") : null}
          pending={decline.isPending}
          onConfirm={() => {
            decline.reset();
            // The hook's settle refetches the list, which removes this row.
            decline.mutate(group.id, { onSuccess: () => setConfirmingDecline(false) });
          }}
          onCancel={() => {
            decline.reset();
            setConfirmingDecline(false);
          }}
        />
      )}
    </li>
  );
}
