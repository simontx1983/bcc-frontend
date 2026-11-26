"use client";

/**
 * OwnerPanel — who owns a validator page, and what staff may do about
 * it. One of four states, driven ONLY by the route 2 response:
 *
 *   conflict  `conflict_users` non-empty → the claimants, read-only.
 *   no owner  `owner === null`           → LinkOwnerForm.
 *   staff     `owner.locked_for_staff === false` → details, Revoke, and
 *             "Cancel this link" when `owner.cancellable === true`.
 *   locked    any other owner            → details, read-only.
 *
 * The lock is the server's flag and nothing else (D3, permanent): staff
 * actions render only on an explicit `false`. True, missing or not a
 * boolean is LOCKED — fail closed, whatever the verification kind or
 * method says. The verification shows the server's `label`.
 *
 * Evidence is text only, with Copy for the reference (security D5).
 * Revoke reasons come from the response, never a local list.
 */

import { Lock } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { AdminField } from "@/components/admin/validators/AdminField";
import { AdminUserChip } from "@/components/admin/validators/AdminUserChip";
import {
  EvidenceNote,
  EvidenceRef,
  useEvidenceRefCopy,
} from "@/components/admin/validators/Evidence";
import {
  ADMIN_FIELD_ERROR_CLASS,
  ADMIN_INPUT_CLASS,
  ADMIN_LABEL_CLASS,
  ADMIN_OUTLINE_BUTTON_CLASS,
  ADMIN_TEXTAREA_CLASS,
} from "@/components/admin/validators/form-classes";
import {
  EVIDENCE_TYPE_LABEL,
  labelFor,
  verificationLabel,
} from "@/components/admin/validators/labels";
import { LinkOwnerForm } from "@/components/admin/validators/LinkOwnerForm";
import type { OwnerPanelNotice } from "@/components/admin/validators/OwnerNotice";
import { LOCKED_FOR_STAFF_COPY, lockedForStaff } from "@/components/admin/validators/StatePill";
import { StepUpDialog } from "@/components/admin/validators/StepUpDialog";
import { useCancelValidatorOwnerLink, useRevokeValidatorOwner } from "@/hooks/useAdminValidators";
import type {
  AdminValidatorPageOwner,
  AdminValidatorPageRelationships,
  AdminValidatorRevokeReason,
} from "@/lib/api/types";
import { formatAbsoluteDateTime } from "@/lib/format";

export const OWNER_COPY = {
  conflictNote: "A page with a proof-verified claim can't be changed here.",
  revokeHeading: "Revoke",
  revokeIntro: "Removes this owner from the page.",
  reasonRequired: "Pick a reason.",
  noReasons: "The server sent no revoke reasons, so this owner can't be revoked here.",
  revoked: "Owner revoked.",
  cancelHeading: "Cancel this link",
  cancelIntro: "Removes this staff-approved owner link.",
  cancelled: "Link cancelled.",
  rejected: "The server didn't accept this. Check it and try again.",
} as const;

/**
 * Staff may act ONLY on an explicit server `false`. Anything else —
 * true, missing, or not a boolean — is locked (fail closed).
 */
export function staffMayAct(owner: AdminValidatorPageOwner): boolean {
  return !lockedForStaff(owner);
}

function When({ iso }: { iso: string }) {
  const text = formatAbsoluteDateTime(iso);
  return <time dateTime={iso}>{text !== "" ? text : iso}</time>;
}

export interface OwnerPanelProps {
  data: AdminValidatorPageRelationships;
  onNotice: (notice: OwnerPanelNotice | null) => void;
}

export function OwnerPanel({ data, onNotice }: OwnerPanelProps) {
  const pageId = data.page.page_id;
  const owner = data.owner;
  const headingId = useId();

  let body: React.ReactNode;
  if (data.conflict_users.length > 0) {
    body = <ConflictState data={data} />;
  } else if (owner === null) {
    body = <LinkOwnerForm pageId={pageId} onNotice={onNotice} />;
  } else if (staffMayAct(owner)) {
    body = (
      <StaffOwnerState
        pageId={pageId}
        owner={owner}
        reasons={data.revoke_reasons}
        onNotice={onNotice}
      />
    );
  } else {
    body = <LockedOwnerState owner={owner} />;
  }

  return (
    <section aria-labelledby={headingId} className="bcc-panel flex flex-col gap-5 p-5 sm:p-6">
      <h2 id={headingId} className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
        OWNERSHIP
      </h2>
      {body}
    </section>
  );
}

function LockedOwnerState({ owner }: { owner: AdminValidatorPageOwner }) {
  return (
    <div className="flex flex-col gap-4" data-owner-state="locked">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <AdminField label="Owner" wide>
          <AdminUserChip user={owner.user} />
        </AdminField>
        <AdminField label="Verification">{verificationLabel(owner.verification)}</AdminField>
        <AdminField label="Verified">
          <When iso={owner.verification.verified_at} />
        </AdminField>
      </dl>
      <p className="flex items-start gap-2 font-serif text-bcc-text-secondary">
        <Lock aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0" />
        {LOCKED_FOR_STAFF_COPY}
      </p>
    </div>
  );
}

function ConflictState({ data }: { data: AdminValidatorPageRelationships }) {
  return (
    <div className="flex flex-col gap-4" data-owner-state="conflict">
      {data.owner !== null && (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <AdminField label="Current owner">
            <AdminUserChip user={data.owner.user} />
          </AdminField>
          <AdminField label="Verification">{verificationLabel(data.owner.verification)}</AdminField>
        </dl>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary">
          CONFLICTING CLAIMS
        </h3>
        <ul className="flex flex-col gap-2">
          {data.conflict_users.map(({ user, verification }) => (
            <li
              key={user.user_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-bcc-border px-3 py-2"
            >
              <AdminUserChip user={user} />
              <span className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-secondary">
                {verificationLabel(verification).toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="font-serif italic text-bcc-text-secondary">{OWNER_COPY.conflictNote}</p>
    </div>
  );
}

interface StaffOwnerStateProps {
  pageId: number;
  owner: AdminValidatorPageOwner;
  reasons: AdminValidatorRevokeReason[];
  onNotice: (notice: OwnerPanelNotice | null) => void;
}

function StaffOwnerState({ pageId, owner, reasons, onNotice }: StaffOwnerStateProps) {
  const { outcome, copyRef } = useEvidenceRefCopy<"owner">();
  const note = owner.evidence_note ?? "";
  const ref = owner.evidence_ref ?? "";

  return (
    <div className="flex flex-col gap-5" data-owner-state="staff">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <AdminField label="Owner" wide>
          <AdminUserChip user={owner.user} />
        </AdminField>
        <AdminField label="Verification">{verificationLabel(owner.verification)}</AdminField>
        <AdminField label="Evidence">
          {owner.evidence_type === null ? "—" : labelFor(EVIDENCE_TYPE_LABEL, owner.evidence_type)}
        </AdminField>
        <AdminField label="Linked by">
          {owner.linked_by === null ? "—" : <AdminUserChip user={owner.linked_by} size="xs" />}
        </AdminField>
        <AdminField label="Linked">
          <When iso={owner.linked_at} />
        </AdminField>
        {note !== "" && (
          <AdminField label="Evidence note" wide>
            <EvidenceNote note={note} />
          </AdminField>
        )}
        {ref !== "" && (
          <AdminField label="Evidence reference" wide>
            <EvidenceRef
              value={ref}
              copyLabel="Copy evidence reference"
              onCopy={() => copyRef("owner", ref)}
            />
          </AdminField>
        )}
      </dl>
      <p role="status" className="bcc-mono min-h-[1rem] text-[10px] text-bcc-text-secondary">
        {outcome === null
          ? ""
          : outcome.ok
            ? "Evidence reference copied."
            : "Couldn't copy the evidence reference."}
      </p>

      <RevokeOwner pageId={pageId} owner={owner} reasons={reasons} onNotice={onNotice} />
      {owner.cancellable === true && <CancelLink pageId={pageId} owner={owner} onNotice={onNotice} />}
    </div>
  );
}

function RevokeOwner({ pageId, owner, reasons, onNotice }: StaffOwnerStateProps) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ reason?: string | undefined; note?: string | undefined }>({});
  const [confirming, setConfirming] = useState(false);
  const revoke = useRevokeValidatorOwner(pageId);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const idPrefix = useId();
  const noReasons = reasons.length === 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noReasons) return;
    if (reason === "") {
      setErrors({ reason: OWNER_COPY.reasonRequired });
      reasonRef.current?.focus();
      return;
    }
    setErrors({});
    onNotice(null);
    setConfirming(true);
  }

  const closeDialog = () => {
    setConfirming(false);
    revoke.reset();
  };

  return (
    <>
      <form
        noValidate
        onSubmit={onSubmit}
        aria-labelledby={`${idPrefix}-heading`}
        className="flex flex-col gap-3 border-t border-dashed border-bcc-border pt-5"
      >
        <div>
          <h3 id={`${idPrefix}-heading`} className="bcc-stencil text-xl text-bcc-text">
            {OWNER_COPY.revokeHeading}
          </h3>
          <p className="mt-1 font-serif text-bcc-text-secondary">{OWNER_COPY.revokeIntro}</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${idPrefix}-reason`} className={ADMIN_LABEL_CLASS}>
            REASON
          </label>
          <select
            ref={reasonRef}
            id={`${idPrefix}-reason`}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setErrors((prev) => ({ ...prev, reason: undefined }));
            }}
            required
            aria-invalid={errors.reason !== undefined}
            aria-describedby={errors.reason !== undefined ? `${idPrefix}-reason-error` : undefined}
            className={ADMIN_INPUT_CLASS}
          >
            <option value="">Choose…</option>
            {reasons.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          {errors.reason !== undefined && (
            <p id={`${idPrefix}-reason-error`} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
              {errors.reason}
            </p>
          )}
        </div>
        <NoteField
          id={`${idPrefix}-note`}
          value={note}
          onChange={(v) => {
            setNote(v);
            setErrors((prev) => ({ ...prev, note: undefined }));
          }}
          error={errors.note}
          textareaRef={noteRef}
        />
        {noReasons && <p className="font-serif italic text-bcc-text-secondary">{OWNER_COPY.noReasons}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            aria-disabled={noReasons}
            title={noReasons ? OWNER_COPY.noReasons : undefined}
            className={ADMIN_OUTLINE_BUTTON_CLASS}
          >
            Revoke owner
          </button>
        </div>
      </form>

      {confirming && (
        <StepUpDialog
          pageId={pageId}
          action="revoke_owner"
          targetUserId={owner.user.user_id}
          title="Revoke owner"
          write={{
            isPending: revoke.isPending,
            reset: revoke.reset,
            run: (proof, onError) =>
              revoke.mutate(
                { linkId: owner.link_id, body: { reason, note: note.trim(), ...proof } },
                {
                  onSuccess: () => {
                    closeDialog();
                    onNotice({ tone: "status", text: OWNER_COPY.revoked });
                  },
                  onError,
                },
              ),
          }}
          onConflict={(message) => {
            closeDialog();
            onNotice({ tone: "alert", text: message });
          }}
          onFieldError={(field) => {
            if (field !== "reason" && field !== "note") return false;
            closeDialog();
            setErrors(field === "reason" ? { reason: OWNER_COPY.rejected } : { note: OWNER_COPY.rejected });
            window.setTimeout(() => (field === "reason" ? reasonRef : noteRef).current?.focus(), 0);
            return true;
          }}
          onClose={closeDialog}
        />
      )}
    </>
  );
}

function CancelLink({
  pageId,
  owner,
  onNotice,
}: Omit<StaffOwnerStateProps, "reasons">) {
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const cancel = useCancelValidatorOwnerLink(pageId);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const idPrefix = useId();

  const closeDialog = () => {
    setConfirming(false);
    cancel.reset();
  };

  return (
    <>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setNoteError(undefined);
          onNotice(null);
          setConfirming(true);
        }}
        aria-labelledby={`${idPrefix}-heading`}
        className="flex flex-col gap-3 border-t border-dashed border-bcc-border pt-5"
      >
        <div>
          <h3 id={`${idPrefix}-heading`} className="bcc-stencil text-xl text-bcc-text">
            {OWNER_COPY.cancelHeading}
          </h3>
          <p className="mt-1 font-serif text-bcc-text-secondary">{OWNER_COPY.cancelIntro}</p>
        </div>
        <NoteField
          id={`${idPrefix}-note`}
          value={note}
          onChange={(v) => {
            setNote(v);
            setNoteError(undefined);
          }}
          error={noteError}
          textareaRef={noteRef}
        />
        <div className="flex justify-end">
          <button type="submit" className={ADMIN_OUTLINE_BUTTON_CLASS}>
            Cancel this link
          </button>
        </div>
      </form>

      {confirming && (
        <StepUpDialog
          pageId={pageId}
          action="cancel_link"
          targetUserId={owner.user.user_id}
          title="Cancel this link"
          write={{
            isPending: cancel.isPending,
            reset: cancel.reset,
            run: (proof, onError) =>
              cancel.mutate(
                { linkId: owner.link_id, body: { note: note.trim(), ...proof } },
                {
                  onSuccess: (res) => {
                    closeDialog();
                    onNotice({
                      tone: "status",
                      text: OWNER_COPY.cancelled,
                      restoredOwner: res.restored_owner,
                    });
                  },
                  onError,
                },
              ),
          }}
          onConflict={(message) => {
            closeDialog();
            onNotice({ tone: "alert", text: message });
          }}
          onFieldError={(field) => {
            if (field !== "note") return false;
            closeDialog();
            setNoteError(OWNER_COPY.rejected);
            window.setTimeout(() => noteRef.current?.focus(), 0);
            return true;
          }}
          onClose={closeDialog}
        />
      )}
    </>
  );
}

function NoteField({
  id,
  value,
  onChange,
  error,
  textareaRef,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
  textareaRef: React.Ref<HTMLTextAreaElement>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={ADMIN_LABEL_CLASS}>
        NOTE <span className="tracking-normal">(optional)</span>
      </label>
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        className={ADMIN_TEXTAREA_CLASS}
      />
      {error !== undefined && (
        <p id={`${id}-error`} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
}
