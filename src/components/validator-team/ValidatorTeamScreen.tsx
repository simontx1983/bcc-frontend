"use client";

/**
 * ValidatorTeamScreen — one validator page's team, for a signed-in
 * member (validator admin V1, PR B2). Everything is driven by route 5:
 *
 *   - the members (TeamMembers), with Remove / Cancel invite / Re-confirm
 *     only where `can` allows;
 *   - the invite form, only when `can.invite_administrator` or
 *     `can.invite_representative`;
 *   - the viewer's own membership (visibility, leave), only where `can`
 *     allows;
 *   - for the owner (route 5's `viewer.role`): the link to the
 *     permissions page and "Recent changes you can undo" from
 *     `revertable`;
 *   - with `?revert=<eventId>` (the email deep link), the revert confirm
 *     for that change at the top. Nothing happens on load.
 *
 * No business logic: no role ranks, no permission table. A role, a
 * status or a flag is shown as the server sends it.
 *
 * ⛔ Staff-only data never appears here: no relationship history, no
 * evidence, no wallet address, not even for the owner on their own page.
 * This screen calls route 5 and the team writes, nothing else.
 */

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { OwnerNotice, type OwnerPanelNotice } from "@/components/admin/validators/OwnerNotice";
import { TeamInviteForm, invitableRoles } from "@/components/validator-team/TeamInviteForm";
import { TeamMembers } from "@/components/validator-team/TeamMembers";
import { TeamReadFailure } from "@/components/validator-team/TeamReadFailure";
import { RevertConfirm, TeamRevertList } from "@/components/validator-team/TeamRevert";
import { TeamSelfSection } from "@/components/validator-team/TeamSelfSection";
import { SKELETON_CLASS } from "@/components/ui/Skeleton";
import { useValidatorTeam } from "@/hooks/useValidatorTeam";
import { TeamPageTitle } from "@/components/validator-team/TeamPageTitle";

const UNAVAILABLE = "This team couldn't be read just now.";

/** The bordered mono link /me/validator-pages uses. */
const LINK_CLASS =
  "bcc-mono inline-flex min-h-[44px] items-center border border-bcc-border px-4 py-2 text-sm text-bcc-text hover:border-safety";

export const TEAM_SCREEN_COPY = {
  left: "You've left this team.",
  leftBody: "The owner or an administrator can invite you again if you're needed.",
  permissionsLink: "Team permissions",
} as const;

export interface ValidatorTeamScreenProps {
  pageId: number;
  /** The `?revert=` event id from the email link; null when absent or not an id. */
  revertEventId: number | null;
}

export function ValidatorTeamScreen({ pageId, revertEventId }: ValidatorTeamScreenProps) {
  const query = useValidatorTeam(pageId);
  const [notice, setNotice] = useState<OwnerPanelNotice | null>(null);
  const [left, setLeft] = useState(false);

  if (left) {
    return (
      <div className="bcc-panel flex flex-col gap-3 p-6" role="status">
        <p className="font-serif text-lg text-bcc-text">{TEAM_SCREEN_COPY.left}</p>
        <p className="font-serif text-bcc-text-secondary">{TEAM_SCREEN_COPY.leftBody}</p>
        <Link
          href={"/me/validator-pages" as Route}
          className={LINK_CLASS + " w-fit"}
        >
          BACK TO YOUR VALIDATOR PAGES
        </Link>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div>
        <p role="status" className="sr-only">
          Loading the team…
        </p>
        <div aria-hidden className="flex flex-col gap-4">
          <div className={SKELETON_CLASS + " h-48"} />
          <div className={SKELETON_CLASS + " h-40"} />
        </div>
      </div>
    );
  }

  // Nothing to show beside a first-load failure: the panel replaces the screen.
  if (query.isLoadingError) {
    return (
      <TeamReadFailure error={query.error} unavailable={UNAVAILABLE} onRetry={() => void query.refetch()} />
    );
  }

  const data = query.data;
  const isOwner = data.viewer.role === "owner";
  const revertable = data.revertable ?? [];
  const mayInvite = invitableRoles(data.can).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <TeamPageTitle page={data.page} />
      {revertEventId !== null && <RevertConfirm pageId={pageId} eventId={revertEventId} data={data} revertable={revertable} />}

      {isOwner && (
        <div className="flex justify-end">
          <Link
            href={`/me/validator-pages/${pageId}/team/permissions` as Route}
            className={LINK_CLASS}
          >
            {TEAM_SCREEN_COPY.permissionsLink.toUpperCase()}
          </Link>
        </div>
      )}

      {query.isRefetchError && (
        <TeamReadFailure error={query.error} unavailable={UNAVAILABLE} onRetry={() => void query.refetch()} />
      )}
      <OwnerNotice notice={notice} />

      <TeamMembers pageId={pageId} items={data.items} can={data.can} onNotice={setNotice} />
      {mayInvite && <TeamInviteForm pageId={pageId} data={data} />}
      <TeamSelfSection pageId={pageId} data={data} onLeft={() => setLeft(true)} />
      {isOwner && <TeamRevertList pageId={pageId} items={revertable} onNotice={setNotice} />}
    </div>
  );
}
