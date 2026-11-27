"use client";

/**
 * The owner's one-step revert, from route 5's `revertable` (empty for
 * anyone but the owner).
 *
 *   - TeamRevertList: "Recent changes you can undo" — each row shows ONLY
 *     what the server sends for it (its `summary`, the actor and the
 *     time) and an Undo button that POSTs the revert.
 *   - RevertConfirm: the email deep link (`?revert=<eventId>`). It shows
 *     that change and an "Undo this change" button. NOTHING runs on load:
 *     the POST happens only on the click.
 *
 * ⛔ Relationship history and evidence are staff-only. Nothing here reads
 * or renders either; `summary` is the only description of a change.
 *
 * `revert_stale` and `not_revertable` (409) have their own lines. After
 * an undo the team read refreshes (useRevertValidatorTeamEvent), so the
 * row leaves; focus moves to the next row's Undo, or the heading.
 */

import { useEffect, useId, useRef, useState } from "react";

import { AdminUserChip } from "@/components/admin/validators/AdminUserChip";
import {
  ADMIN_FIELD_ERROR_CLASS,
  ADMIN_OUTLINE_BUTTON_CLASS,
  ADMIN_PRIMARY_BUTTON_CLASS,
} from "@/components/admin/validators/form-classes";
import type { OwnerPanelNotice } from "@/components/admin/validators/OwnerNotice";
import { TEAM_CONFLICT_COPY, teamWriteErrorCopy } from "@/components/validator-team/team-copy";
import { useRevertValidatorTeamEvent } from "@/hooks/useValidatorTeam";
import type { ValidatorTeamResponse, ValidatorTeamRevertable } from "@/lib/api/types";
import { formatAbsoluteDateTime } from "@/lib/format";

export const REVERT_COPY = {
  heading: "RECENT CHANGES YOU CAN UNDO",
  empty: "Nothing to undo right now.",
  undone: "Change undone.",
  confirmEyebrow: "UNDO A CHANGE",
  confirmHeading: "Undo this change?",
  confirmButton: "Undo this change",
  ownerOnly: "Only the page owner can undo changes to this team.",
} as const;

function When({ iso }: { iso: string }) {
  const text = formatAbsoluteDateTime(iso);
  return <time dateTime={iso}>{text !== "" ? text : iso}</time>;
}

/** The server's summary, who made the change, and when. */
function ChangeDetails({ change }: { change: ValidatorTeamRevertable }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="break-words font-serif text-bcc-text">{change.summary}</p>
      <div className="bcc-mono flex flex-wrap items-center gap-2 text-[10px] tracking-[0.16em] text-bcc-text-secondary">
        {change.actor !== null && (
          <>
            <span>BY</span>
            <AdminUserChip user={change.actor} size="xs" />
            <span aria-hidden>·</span>
          </>
        )}
        <When iso={change.at} />
      </div>
    </div>
  );
}

export interface TeamRevertListProps {
  pageId: number;
  items: ValidatorTeamRevertable[];
  onNotice: (notice: OwnerPanelNotice | null) => void;
}

export function TeamRevertList({ pageId, items, onNotice }: TeamRevertListProps) {
  const revert = useRevertValidatorTeamEvent(pageId);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(new Map());
  const headingId = useId();
  const undoButtons = useRef(new Map<number, HTMLButtonElement>());

  function undo(change: ValidatorTeamRevertable, nextId: number | null) {
    // One undo at a time: a press while another is out does nothing.
    if (busyId !== null || revert.isPending) return;
    setBusyId(change.event_id);
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(change.event_id);
      return next;
    });
    revert.mutate(change.event_id, {
      onSuccess: () => {
        setBusyId(null);
        const target =
          (nextId !== null ? undoButtons.current.get(nextId) : undefined) ??
          document.getElementById(headingId);
        target?.focus();
        onNotice({ tone: "status", text: REVERT_COPY.undone });
      },
      onError: (err) => {
        setBusyId(null);
        setErrors((prev) => new Map(prev).set(change.event_id, teamWriteErrorCopy(err)));
      },
    });
  }

  return (
    <section aria-labelledby={headingId} className="bcc-panel flex flex-col gap-4 p-5 sm:p-6">
      <h2
        id={headingId}
        tabIndex={-1}
        className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary"
      >
        {REVERT_COPY.heading}
      </h2>
      {items.length === 0 ? (
        <p className="font-serif italic text-bcc-text-secondary">{REVERT_COPY.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-bcc-border border-y border-bcc-border">
          {items.map((change, index) => {
            const busy = busyId === change.event_id;
            const error = errors.get(change.event_id);
            const errorId = `${headingId}-err-${change.event_id}`;
            return (
              <li
                key={change.event_id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <ChangeDetails change={change} />
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <button
                    ref={(el) => {
                      if (el === null) undoButtons.current.delete(change.event_id);
                      else undoButtons.current.set(change.event_id, el);
                    }}
                    type="button"
                    onClick={() => undo(change, items[index + 1]?.event_id ?? null)}
                    aria-disabled={busyId !== null}
                    aria-busy={busy}
                    aria-label={busy ? `Undoing: ${change.summary}` : `Undo: ${change.summary}`}
                    aria-describedby={error !== undefined ? errorId : undefined}
                    className={ADMIN_OUTLINE_BUTTON_CLASS}
                  >
                    {busy ? "Undoing…" : "Undo"}
                  </button>
                  {error !== undefined && (
                    <p
                      id={errorId}
                      role="alert"
                      className={ADMIN_FIELD_ERROR_CLASS + " max-w-[16rem] sm:text-right"}
                    >
                      {error}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export interface RevertConfirmProps {
  pageId: number;
  eventId: number;
  data: ValidatorTeamResponse;
  /** Route 5's `revertable` (empty when the server sent none). */
  revertable: ValidatorTeamRevertable[];
}

/** The email deep link's confirm. Renders the change; only the click POSTs. */
export function RevertConfirm({ pageId, eventId, data, revertable }: RevertConfirmProps) {
  const revert = useRevertValidatorTeamEvent(pageId);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latch = useRef(false);
  const headingId = useId();
  const doneRef = useRef<HTMLParagraphElement>(null);
  const change = revertable.find((c) => c.event_id === eventId);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  let body: React.ReactNode;
  if (done) {
    body = (
      <p ref={doneRef} tabIndex={-1} role="status" className="font-serif text-bcc-text">
        {REVERT_COPY.undone}
      </p>
    );
  } else if (data.viewer.role !== "owner") {
    body = <p className="font-serif italic text-bcc-text-secondary">{REVERT_COPY.ownerOnly}</p>;
  } else if (change === undefined) {
    body = (
      <p className="font-serif italic text-bcc-text-secondary">{TEAM_CONFLICT_COPY["not_revertable"]}</p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ChangeDetails change={change} />
        {error !== null && (
          <p role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
            {error}
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={() => {
              if (latch.current || revert.isPending) return;
              latch.current = true;
              setError(null);
              revert.mutate(change.event_id, {
                onSuccess: () => {
                  latch.current = false;
                  setDone(true);
                },
                onError: (err) => {
                  latch.current = false;
                  setError(teamWriteErrorCopy(err));
                },
              });
            }}
            aria-disabled={revert.isPending}
            aria-busy={revert.isPending}
            className={ADMIN_PRIMARY_BUTTON_CLASS}
          >
            {revert.isPending ? "Undoing…" : REVERT_COPY.confirmButton}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="bcc-panel flex flex-col gap-3 p-5 sm:p-6">
      <p className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-safety">
        {REVERT_COPY.confirmEyebrow}
      </p>
      <h2 id={headingId} className="bcc-stencil text-2xl text-bcc-text">
        {REVERT_COPY.confirmHeading}
      </h2>
      {body}
    </section>
  );
}
