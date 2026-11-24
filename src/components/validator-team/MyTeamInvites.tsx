"use client";

/**
 * MyTeamInvites — the signed-in member's pending validator team invites
 * (route 8), each with Accept and Decline (route 9).
 *
 * Each invite shows the page (linked to its public page, /v/<slug>, the
 * way /me/validator-pages links it), the role, who invited them ("BCC
 * staff" without a name when staff added them) and when it expires.
 *
 * An accepted invite leaves the list on the refresh, so its outcome
 * stays above the list with "Go to the team" (focus moves there). A
 * refused answer (an expired invite, one no longer pending) is said above
 * the list too: the row it belonged to may be gone after the refresh.
 *
 * Accept and Decline run through `mutateAsync`, one promise per press,
 * so two rows answered at once each get their own outcome (the F-446
 * pattern in BlocksList).
 */

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { AdminEmptyState, AdminListSkeleton } from "@/components/admin/validators/AdminListStates";
import { AdminUserChip } from "@/components/admin/validators/AdminUserChip";
import {
  ADMIN_OUTLINE_BUTTON_CLASS,
  ADMIN_PRIMARY_BUTTON_CLASS,
} from "@/components/admin/validators/form-classes";
import { OwnerNotice, type OwnerPanelNotice } from "@/components/admin/validators/OwnerNotice";
import { TeamReadFailure } from "@/components/validator-team/TeamReadFailure";
import { roleLabel, teamWriteErrorCopy } from "@/components/validator-team/team-copy";
import { useAcceptTeamInvite, useDeclineTeamInvite, useMyTeamInvites } from "@/hooks/useValidatorTeam";
import type { MyTeamInvite } from "@/lib/api/types";
import { formatShortDate } from "@/lib/format";

export const INVITES_COPY = {
  heading: "PENDING INVITES",
  unavailable: "Your invites couldn't be read just now.",
  emptyEyebrow: "NO INVITES",
  emptyHeading: "Nothing waiting for you.",
  emptyBody:
    "When a validator page's owner or an administrator invites you onto their team, the invite shows up here.",
  invitedByStaff: "Invited by BCC staff",
  goToTeam: "Go to the team",
  declined: "Invite declined.",
} as const;

interface Accepted {
  membershipId: number;
  pageId: number;
  title: string;
}

export function MyTeamInvites() {
  const query = useMyTeamInvites();
  const accept = useAcceptTeamInvite();
  const decline = useDeclineTeamInvite();
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const inFlight = useRef(new Set<number>());
  const [accepted, setAccepted] = useState<Accepted[]>([]);
  const [notice, setNotice] = useState<OwnerPanelNotice | null>(null);
  const headingId = useId();
  const acceptButtons = useRef(new Map<number, HTMLButtonElement>());
  const goToTeamLinks = useRef(new Map<number, HTMLAnchorElement>());
  const focusLink = useRef<number | null>(null);

  useEffect(() => {
    const target = focusLink.current;
    if (target === null) return;
    focusLink.current = null;
    goToTeamLinks.current.get(target)?.focus();
  }, [accepted]);

  function settle(id: number) {
    inFlight.current.delete(id);
    setBusy((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function start(id: number): boolean {
    if (inFlight.current.has(id)) return false;
    inFlight.current.add(id);
    setBusy((prev) => new Set(prev).add(id));
    setNotice(null);
    return true;
  }

  function onAccept(invite: MyTeamInvite) {
    if (!start(invite.membership_id)) return;
    accept
      .mutateAsync({ membershipId: invite.membership_id, pageId: invite.page.page_id })
      .then(
        () => {
          focusLink.current = invite.membership_id;
          setAccepted((prev) => [
            ...prev,
            { membershipId: invite.membership_id, pageId: invite.page.page_id, title: invite.page.title },
          ]);
        },
        (err: unknown) =>
          setNotice({ tone: "alert", text: `${invite.page.title}: ${teamWriteErrorCopy(err)}` }),
      )
      .finally(() => settle(invite.membership_id));
  }

  function onDecline(invite: MyTeamInvite, nextId: number | null) {
    if (!start(invite.membership_id)) return;
    decline
      .mutateAsync(invite.membership_id)
      .then(
        () => {
          const next = nextId !== null ? acceptButtons.current.get(nextId) : undefined;
          (next ?? document.getElementById(headingId))?.focus();
          setNotice({ tone: "status", text: INVITES_COPY.declined });
        },
        (err: unknown) =>
          setNotice({ tone: "alert", text: `${invite.page.title}: ${teamWriteErrorCopy(err)}` }),
      )
      .finally(() => settle(invite.membership_id));
  }

  if (query.isPending) {
    return <AdminListSkeleton label="Loading your invites…" rowClassName="h-28" />;
  }
  if (query.isLoadingError) {
    return (
      <TeamReadFailure
        error={query.error}
        unavailable={INVITES_COPY.unavailable}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const items = query.data.items;

  return (
    <div className="flex flex-col gap-4">
      {query.isRefetchError && (
        <TeamReadFailure
          error={query.error}
          unavailable={INVITES_COPY.unavailable}
          onRetry={() => void query.refetch()}
        />
      )}

      <div role="status" className="flex flex-col gap-3 empty:hidden">
        {accepted.map((a) => (
          <div key={a.membershipId} className="bcc-panel flex flex-col gap-3 p-4">
            <p className="font-serif text-bcc-text">You&apos;re on the team for {a.title}.</p>
            <Link
              ref={(el) => {
                if (el === null) goToTeamLinks.current.delete(a.membershipId);
                else goToTeamLinks.current.set(a.membershipId, el);
              }}
              href={`/me/validator-pages/${a.pageId}/team` as Route}
              className="bcc-mono inline-flex min-h-[44px] w-fit items-center border border-bcc-border px-4 py-2 text-sm text-bcc-text hover:border-safety"
            >
              {INVITES_COPY.goToTeam.toUpperCase()}
            </Link>
          </div>
        ))}
      </div>
      <OwnerNotice notice={notice} />

      <h2
        id={headingId}
        tabIndex={-1}
        className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary"
      >
        {INVITES_COPY.heading}
      </h2>

      {items.length === 0 ? (
        accepted.length === 0 && (
          <AdminEmptyState
            eyebrow={INVITES_COPY.emptyEyebrow}
            heading={INVITES_COPY.emptyHeading}
            body={INVITES_COPY.emptyBody}
          />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((invite, index) => {
            const isBusy = busy.has(invite.membership_id);
            return (
              <li
                key={invite.membership_id}
                className="bcc-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <InviteDetails invite={invite} />
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    ref={(el) => {
                      if (el === null) acceptButtons.current.delete(invite.membership_id);
                      else acceptButtons.current.set(invite.membership_id, el);
                    }}
                    type="button"
                    onClick={() => onAccept(invite)}
                    aria-disabled={isBusy}
                    aria-busy={isBusy}
                    aria-label={`Accept the invite to ${invite.page.title}`}
                    className={ADMIN_PRIMARY_BUTTON_CLASS}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecline(invite, items[index + 1]?.membership_id ?? null)}
                    aria-disabled={isBusy}
                    aria-label={`Decline the invite to ${invite.page.title}`}
                    className={ADMIN_OUTLINE_BUTTON_CLASS}
                  >
                    Decline
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function InviteDetails({ invite }: { invite: MyTeamInvite }) {
  const slug = invite.page.slug;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {slug !== "" ? (
        <Link
          href={`/v/${slug}` as Route}
          className="break-words font-serif text-lg text-bcc-text hover:underline"
        >
          {invite.page.title}
        </Link>
      ) : (
        <p className="break-words font-serif text-lg text-bcc-text">{invite.page.title}</p>
      )}
      <p className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary">
        {roleLabel(invite.role).toUpperCase()} · EXPIRES{" "}
        <time dateTime={invite.expires_at}>{formatShortDate(invite.expires_at).toUpperCase()}</time>
      </p>
      {invite.added_by_staff ? (
        <p className="font-serif text-sm text-bcc-text-secondary">{INVITES_COPY.invitedByStaff}</p>
      ) : invite.invited_by !== null ? (
        <div className="flex flex-wrap items-center gap-2 font-serif text-sm text-bcc-text-secondary">
          <span>Invited by</span>
          <AdminUserChip user={invite.invited_by} size="xs" />
        </div>
      ) : null}
    </div>
  );
}
