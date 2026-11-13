"use client";

/**
 * MyGroupInvitations — the communities the signed-in member has been
 * invited to (F-272, GET /me/group-invites).
 *
 * It is the ONLY way an invitee finds a secret group, so it lives on the
 * /communities page (user decision 2026-11-12) and the bcc_group_invited
 * bell item links there. Self-contained: placing it is one line.
 *
 * Renders nothing while loading and when there are no invitations (an
 * empty "Invitations" block would be noise on a discovery page); a failed
 * read says so with Retry rather than pretending there are none.
 */

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { humanizeJoinRequestError } from "@/components/groups/GroupMembershipStrip";
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

  if (invites.isError) {
    return (
      <section aria-labelledby="my-invitations-heading" className="mx-auto mt-8 max-w-[1440px] px-6 sm:px-8">
        <h2 id="my-invitations-heading" className="bcc-stencil text-2xl text-bcc-text">
          Your invitations
        </h2>
        <div className="mt-3">
          <LoadFailure message="Couldn't load your invitations." onRetry={() => void invites.refetch()} />
        </div>
      </section>
    );
  }

  // Accepting refetches the list, which drops that invitation; the
  // confirmation is kept here so it does not vanish with its row.
  const joinedIds = new Set(joined.map((j) => j.group.id));
  const open = (invites.data?.items ?? []).filter((i) => !joinedIds.has(i.group.id));
  if (open.length === 0 && joined.length === 0) return null;

  return (
    <section aria-labelledby="my-invitations-heading" className="mx-auto mt-8 max-w-[1440px] px-6 sm:px-8">
      <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">FOR YOU</span>
      <h2 id="my-invitations-heading" className="bcc-stencil mt-1 text-2xl text-bcc-text">
        Your invitations
      </h2>
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
  const accept = useAcceptGroupInviteMutation();
  const decline = useDeclineGroupInviteMutation();
  const busy = accept.isPending || decline.isPending;
  const error = accept.error ?? decline.error;
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
        {error !== null && (
          <p role="alert" className="bcc-mono mt-1 text-[11px] text-bcc-text-error">
            {humanizeJoinRequestError(error, "answer")}
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
            accept.mutate(group.id, { onSuccess: onJoined });
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
            decline.mutate(group.id);
          }}
          aria-label={`Decline the invitation to ${group.name}`}
          className="bcc-mono inline-flex min-h-[44px] items-center px-3 text-[11px] tracking-[0.18em] text-bcc-text-secondary hover:text-bcc-text disabled:opacity-60"
        >
          {decline.isPending ? "DECLINING…" : "DECLINE"}
        </button>
      </div>
    </li>
  );
}
