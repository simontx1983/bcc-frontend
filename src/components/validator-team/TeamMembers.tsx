"use client";

/**
 * TeamMembers — the team list on the team screen, rendered exactly as
 * route 5 sends it (a representative gets active members plus their own
 * row; pending invites reach the owner and administrators only). Nothing
 * is filtered or derived here.
 *
 * Each row: avatar, name and @handle, role, status ("Pending · expires
 * <date>" or "Active"), and who added them ("Added by @x", or "Added by
 * BCC staff" without a name).
 *
 * Actions come ONLY from `can`:
 *   - Remove (active) / Cancel invite (pending) when `can.remove[role]`.
 *     An ADMINISTRATOR asks for the viewer's password; a representative
 *     takes a plain confirm and sends no password at all.
 *   - Re-confirm, with the viewer's password, when the member
 *     `needs_reconfirm` and `can.remove[role]` lets the viewer manage
 *     that role.
 *
 * After a removal, focus moves to the next row's first action, or to the
 * list heading when no later row has one (the BlocksList pattern): the
 * pressed button leaves with its row.
 */

import { useEffect, useId, useRef, useState } from "react";

import { AdminUserChip } from "@/components/admin/validators/AdminUserChip";
import { ADMIN_OUTLINE_BUTTON_CLASS } from "@/components/admin/validators/form-classes";
import type { OwnerPanelNotice } from "@/components/admin/validators/OwnerNotice";
import { PasswordConfirmDialog } from "@/components/validator-team/PasswordConfirmDialog";
import {
  isCredentialInvalid,
  roleLabel,
  TEAM_ERROR_COPY,
  teamWriteErrorCopy,
} from "@/components/validator-team/team-copy";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  mutateThenReset,
  useReconfirmValidatorTeamMember,
  useRemoveValidatorTeamMember,
} from "@/hooks/useValidatorTeam";
import { isServiceUnavailable } from "@/lib/api/errors";
import { BccApiError, type ValidatorTeamCan, type ValidatorTeamMembership } from "@/lib/api/types";
import { formatShortDate } from "@/lib/format";

export const MEMBER_COPY = {
  heading: "MEMBERS",
  empty: "No one else is on this team yet.",
  addedByStaff: "Added by BCC staff",
  needsYourReconfirm: "Needs your re-confirmation",
  awaitingReconfirm: "Awaiting re-confirmation",
} as const;

/** The display name, or @handle when the account has none. */
function nameOf(member: ValidatorTeamMembership): string {
  const name = member.user.display_name.trim();
  return name !== "" ? name : `@${member.user.handle}`;
}

/** The viewer may manage (remove, re-confirm) a member of this role. Only an explicit `true`. */
function mayManage(can: ValidatorTeamCan, member: ValidatorTeamMembership): boolean {
  return (can.remove as Readonly<Record<string, unknown>> | undefined)?.[member.role] === true;
}

/** Errors the viewer can retry in place; anything else means the team changed or the action is refused. */
function retryableInPlace(err: unknown): boolean {
  return (
    isServiceUnavailable(err) ||
    (err instanceof BccApiError && (err.status === 429 || err.status === 401)) ||
    !(err instanceof BccApiError)
  );
}

type Pending =
  | { kind: "remove"; member: ValidatorTeamMembership; nextId: number | null }
  | { kind: "reconfirm"; member: ValidatorTeamMembership };

export interface TeamMembersProps {
  pageId: number;
  items: ValidatorTeamMembership[];
  can: ValidatorTeamCan;
  onNotice: (notice: OwnerPanelNotice | null) => void;
}

export function TeamMembers({ pageId, items, can, onNotice }: TeamMembersProps) {
  const remove = useRemoveValidatorTeamMember(pageId);
  const reconfirm = useReconfirmValidatorTeamMember(pageId);
  const [dialog, setDialog] = useState<Pending | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const headingId = useId();
  // Each row's first action button, so focus can land on it.
  const firstActions = useRef(new Map<number, HTMLButtonElement>());
  const removeButtons = useRef(new Map<number, HTMLButtonElement>());
  // Where focus goes once the dialog has closed (Dialog first hands it back to the trigger).
  const focusAfterClose = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (dialog !== null) return;
    const target = focusAfterClose.current;
    focusAfterClose.current = null;
    target?.focus();
  }, [dialog]);

  const heading = () => document.getElementById(headingId);

  function close() {
    setConfirmError(null);
    setDialog(null);
  }

  function openRemove(index: number) {
    const member = items[index];
    if (member === undefined) return;
    // The next row with an action, if any: its button outlives this row.
    let nextId: number | null = null;
    for (const later of items.slice(index + 1)) {
      if (firstActions.current.has(later.membership_id)) {
        nextId = later.membership_id;
        break;
      }
    }
    setConfirmError(null);
    setDialog({ kind: "remove", member, nextId });
  }

  function removed(member: ValidatorTeamMembership, nextId: number | null) {
    focusAfterClose.current =
      (nextId !== null ? firstActions.current.get(nextId) : undefined) ?? heading();
    close();
    onNotice({
      tone: "status",
      text:
        member.status === "pending"
          ? `The invite to ${nameOf(member)} is cancelled.`
          : `${nameOf(member)} is off the team.`,
    });
  }

  function refused(err: unknown) {
    close();
    onNotice({ tone: "alert", text: teamWriteErrorCopy(err) });
  }

  let dialogNode: React.ReactNode = null;
  if (dialog?.kind === "remove") {
    const { member, nextId } = dialog;
    const pendingInvite = member.status === "pending";
    const what = pendingInvite
      ? `Cancels the invite to ${nameOf(member)}.`
      : `Removes ${nameOf(member)} from this team.`;
    if (member.role === "administrator") {
      dialogNode = (
        <PasswordConfirmDialog
          title={pendingInvite ? "Cancel administrator invite" : "Remove administrator"}
          body={`${what} Enter your password to confirm.`}
          confirmLabel={pendingInvite ? "Cancel invite" : "Remove"}
          pending={remove.isPending}
          run={(password, fail) =>
            mutateThenReset(
              remove,
              { membershipId: member.membership_id, body: { current_password: password } },
              {
                onSuccess: () => removed(member, nextId),
                onError: (err) => {
                  if (isCredentialInvalid(err)) fail(TEAM_ERROR_COPY.credentialInvalid, true);
                  else if (retryableInPlace(err)) fail(teamWriteErrorCopy(err), false);
                  else refused(err);
                },
              },
            )
          }
          onClose={close}
        />
      );
    } else {
      dialogNode = (
        <ConfirmDialog
          title={pendingInvite ? "Cancel invite" : "Remove representative"}
          body={what}
          confirmLabel={pendingInvite ? "Cancel invite" : "Remove"}
          cancelLabel="Keep"
          errorMessage={confirmError}
          pending={remove.isPending}
          onConfirm={() => {
            setConfirmError(null);
            mutateThenReset(
              remove,
              { membershipId: member.membership_id, body: {} },
              {
                onSuccess: () => removed(member, nextId),
                onError: (err) => {
                  if (retryableInPlace(err)) setConfirmError(teamWriteErrorCopy(err));
                  else refused(err);
                },
              },
            );
          }}
          onCancel={close}
        />
      );
    }
  } else if (dialog?.kind === "reconfirm") {
    const { member } = dialog;
    dialogNode = (
      <PasswordConfirmDialog
        title="Re-confirm member"
        body={`Confirms ${nameOf(member)} with your password, so powers newly given to their role reach them.`}
        confirmLabel="Re-confirm"
        pending={reconfirm.isPending}
        run={(password, fail) =>
          mutateThenReset(
            reconfirm,
            { membershipId: member.membership_id, body: { current_password: password } },
            {
              onSuccess: () => {
                // Re-confirm leaves with the flag; the row's Remove stays.
                focusAfterClose.current = removeButtons.current.get(member.membership_id) ?? heading();
                close();
                onNotice({ tone: "status", text: `${nameOf(member)} is re-confirmed.` });
              },
              onError: (err) => {
                if (isCredentialInvalid(err)) fail(TEAM_ERROR_COPY.credentialInvalid, true);
                else if (retryableInPlace(err)) fail(teamWriteErrorCopy(err), false);
                else refused(err);
              },
            },
          )
        }
        onClose={close}
      />
    );
  }

  return (
    <section aria-labelledby={headingId} className="bcc-panel flex flex-col gap-4 p-5 sm:p-6">
      <h2
        id={headingId}
        tabIndex={-1}
        className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary"
      >
        {MEMBER_COPY.heading}
      </h2>

      {items.length === 0 ? (
        <p className="font-serif italic text-bcc-text-secondary">{MEMBER_COPY.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bcc-border border-y border-bcc-border">
          {items.map((member, index) => {
            const manage = mayManage(can, member);
            const showReconfirm = manage && member.needs_reconfirm === true;
            const name = nameOf(member);
            const setFirst = (el: HTMLButtonElement | null) => {
              if (el === null) firstActions.current.delete(member.membership_id);
              else firstActions.current.set(member.membership_id, el);
            };
            return (
              <li
                key={member.membership_id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-2">
                  <AdminUserChip user={member.user} />
                  <p className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary">
                    {roleLabel(member.role).toUpperCase()} · <MemberStatus member={member} />
                  </p>
                  <AddedBy member={member} />
                  {member.needs_reconfirm === true && (
                    <span className="bcc-mono inline-flex w-fit items-center gap-1.5 rounded-sm border border-bcc-border px-2 py-0.5 text-[10px] tracking-[0.16em] text-bcc-text">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--bcc-warning)" }}
                      />
                      {(manage ? MEMBER_COPY.needsYourReconfirm : MEMBER_COPY.awaitingReconfirm).toUpperCase()}
                    </span>
                  )}
                </div>

                {manage && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {showReconfirm && (
                      <button
                        ref={setFirst}
                        type="button"
                        onClick={() => {
                          setConfirmError(null);
                          setDialog({ kind: "reconfirm", member });
                        }}
                        aria-label={`Re-confirm ${name}`}
                        className={ADMIN_OUTLINE_BUTTON_CLASS}
                      >
                        Re-confirm
                      </button>
                    )}
                    <button
                      ref={(el) => {
                        if (!showReconfirm) setFirst(el);
                        if (el === null) removeButtons.current.delete(member.membership_id);
                        else removeButtons.current.set(member.membership_id, el);
                      }}
                      type="button"
                      onClick={() => openRemove(index)}
                      aria-label={
                        member.status === "pending" ? `Cancel the invite to ${name}` : `Remove ${name}`
                      }
                      className={ADMIN_OUTLINE_BUTTON_CLASS}
                    >
                      {member.status === "pending" ? "Cancel invite" : "Remove"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dialogNode}
    </section>
  );
}

function MemberStatus({ member }: { member: ValidatorTeamMembership }) {
  if (member.status !== "pending") return <>ACTIVE</>;
  const expires = member.expires_at;
  if (typeof expires !== "string" || expires === "") return <>PENDING</>;
  return (
    <>
      PENDING · EXPIRES <time dateTime={expires}>{formatShortDate(expires).toUpperCase()}</time>
    </>
  );
}

/** "Added by BCC staff" never names the staff member. */
function AddedBy({ member }: { member: ValidatorTeamMembership }) {
  if (member.added_by_staff) {
    return <p className="font-serif text-sm text-bcc-text-secondary">{MEMBER_COPY.addedByStaff}</p>;
  }
  if (member.added_by === null) return null;
  return (
    <p className="font-serif text-sm text-bcc-text-secondary">Added by @{member.added_by.handle}</p>
  );
}
