"use client";

/**
 * LinkOwnerForm — the owner panel's "no owner" state: link a
 * staff-verified owner (route 4) behind the step-up (action
 * "link_owner").
 *
 * Fields: the member (admin user search), the evidence type, a required
 * evidence note (≤2000) and a required evidence reference (≤500). The
 * form checks only presence and length; the server decides the rest, and
 * a 422 naming a field lands back on that field.
 */

import { useId, useRef, useState, type FormEvent } from "react";

import { AdminUserPicker } from "@/components/admin/validators/AdminUserPicker";
import {
  ADMIN_FIELD_ERROR_CLASS,
  ADMIN_INPUT_CLASS,
  ADMIN_LABEL_CLASS,
  ADMIN_PRIMARY_BUTTON_CLASS,
  ADMIN_TEXTAREA_CLASS,
} from "@/components/admin/validators/form-classes";
import { EVIDENCE_TYPE_LABEL, EVIDENCE_TYPE_ORDER } from "@/components/admin/validators/labels";
import type { OwnerPanelNotice } from "@/components/admin/validators/OwnerNotice";
import { StepUpDialog } from "@/components/admin/validators/StepUpDialog";
import { useLinkValidatorOwner } from "@/hooks/useAdminValidators";
import type { AdminUserRef, ValidatorEvidenceType } from "@/lib/api/types";
import { counterToneClass } from "@/lib/counter-tone";

export const EVIDENCE_NOTE_MAX = 2000;
export const EVIDENCE_REF_MAX = 500;

export const LINK_COPY = {
  heading: "Link an owner",
  intro:
    "This page has no owner. Link the member who runs it, and record the evidence you checked.",
  userRequired: "Pick the member who owns this page.",
  typeRequired: "Pick the evidence type.",
  noteRequired: "Add an evidence note.",
  refInvalid: "Enter a complete link starting with http:// or https://.",
  refRequired: "Add an evidence reference.",
  rejected: "The server didn't accept this. Check it and try again.",
  linked: "Owner linked. Every admin has been notified.",
} as const;

type LinkField = "user_id" | "verification_method" | "evidence_note" | "evidence_ref";

/** A 422's `data.field` → this form's field. The step-up's target is the picked user. */
const SERVER_FIELD: Readonly<Record<string, LinkField>> = {
  user_id: "user_id",
  target_user_id: "user_id",
  verification_method: "verification_method",
  evidence_note: "evidence_note",
  evidence_ref: "evidence_ref",
};

const FIELD_ORDER: ReadonlyArray<LinkField> = [
  "user_id",
  "verification_method",
  "evidence_note",
  "evidence_ref",
];

function isEvidenceUrl(value: string): boolean {
  if (!/^https?:\/\/[^/\s]/i.test(value)) return false;
  try {
    return new URL(value).hostname !== "";
  } catch {
    return false;
  }
}

export interface LinkOwnerFormProps {
  pageId: number;
  onNotice: (notice: OwnerPanelNotice | null) => void;
}

export function LinkOwnerForm({ pageId, onNotice }: LinkOwnerFormProps) {
  const [user, setUser] = useState<AdminUserRef | null>(null);
  const [evidenceType, setEvidenceType] = useState<ValidatorEvidenceType | "">("");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const [errors, setErrors] = useState<Partial<Record<LinkField, string>>>({});
  const [confirming, setConfirming] = useState(false);
  const link = useLinkValidatorOwner(pageId);

  const idPrefix = useId();
  const ids: Record<LinkField, string> = {
    user_id: `${idPrefix}-user`,
    verification_method: `${idPrefix}-type`,
    evidence_note: `${idPrefix}-note`,
    evidence_ref: `${idPrefix}-ref`,
  };
  const pickerRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const refRef = useRef<HTMLInputElement>(null);

  const focusField = (field: LinkField) => {
    const el = {
      user_id: user === null ? pickerRef.current : changeRef.current,
      verification_method: typeRef.current,
      evidence_note: noteRef.current,
      evidence_ref: refRef.current,
    }[field];
    el?.focus();
  };

  const clearError = (field: LinkField) =>
    setErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const trimmedNote = note.trim();
  const trimmedRef = ref.trim();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Partial<Record<LinkField, string>> = {};
    if (user === null) found.user_id = LINK_COPY.userRequired;
    if (evidenceType === "") found.verification_method = LINK_COPY.typeRequired;
    if (trimmedNote === "") found.evidence_note = LINK_COPY.noteRequired;
    if (trimmedRef === "") found.evidence_ref = LINK_COPY.refRequired;
    else if (!isEvidenceUrl(trimmedRef)) found.evidence_ref = LINK_COPY.refInvalid;
    setErrors(found);
    const first = FIELD_ORDER.find((f) => found[f] !== undefined);
    if (first !== undefined) {
      focusField(first);
      return;
    }
    onNotice(null);
    setConfirming(true);
  }

  const closeDialog = () => {
    setConfirming(false);
    // The write's variables held the code; drop them with the dialog.
    link.reset();
  };

  const errorId = (field: LinkField) => `${ids[field]}-error`;
  const describedBy = (field: LinkField, extra?: string) =>
    [errors[field] !== undefined ? errorId(field) : null, extra ?? null]
      .filter((v): v is string => v !== null)
      .join(" ") || undefined;
  const fieldError = (field: LinkField) =>
    errors[field] === undefined ? null : (
      <p id={errorId(field)} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
        {errors[field]}
      </p>
    );

  return (
    <>
      <form noValidate onSubmit={onSubmit} aria-labelledby={`${idPrefix}-heading`} className="flex flex-col gap-5">
        <div>
          <h3 id={`${idPrefix}-heading`} className="bcc-stencil text-xl text-bcc-text">
            {LINK_COPY.heading}
          </h3>
          <p className="mt-1 font-serif text-bcc-text-secondary">{LINK_COPY.intro}</p>
        </div>

        <div className="flex flex-col gap-2">
          <label id={`${ids.user_id}-label`} htmlFor={ids.user_id} className={ADMIN_LABEL_CLASS}>
            MEMBER
          </label>
          <AdminUserPicker
            id={ids.user_id}
            labelId={`${ids.user_id}-label`}
            value={user}
            onChange={(next) => {
              setUser(next);
              clearError("user_id");
            }}
            describedBy={describedBy("user_id")}
            invalid={errors.user_id !== undefined}
            inputRef={pickerRef}
            changeRef={changeRef}
          />
          {fieldError("user_id")}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.verification_method} className={ADMIN_LABEL_CLASS}>
            EVIDENCE TYPE
          </label>
          <select
            ref={typeRef}
            id={ids.verification_method}
            value={evidenceType}
            onChange={(e) => {
              setEvidenceType(e.target.value as ValidatorEvidenceType | "");
              clearError("verification_method");
            }}
            required
            aria-invalid={errors.verification_method !== undefined}
            aria-describedby={describedBy("verification_method")}
            className={ADMIN_INPUT_CLASS}
          >
            <option value="">Choose…</option>
            {EVIDENCE_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {EVIDENCE_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
          {fieldError("verification_method")}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.evidence_note} className={ADMIN_LABEL_CLASS}>
            EVIDENCE NOTE
          </label>
          <textarea
            ref={noteRef}
            id={ids.evidence_note}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              clearError("evidence_note");
            }}
            maxLength={EVIDENCE_NOTE_MAX}
            rows={4}
            required
            placeholder="What you checked, and what it showed."
            aria-invalid={errors.evidence_note !== undefined}
            aria-describedby={describedBy("evidence_note", `${ids.evidence_note}-count`)}
            className={ADMIN_TEXTAREA_CLASS}
          />
          <span
            id={`${ids.evidence_note}-count`}
            className={
              "bcc-mono self-end text-[10px] " +
              counterToneClass(note.length, EVIDENCE_NOTE_MAX, EVIDENCE_NOTE_MAX - 100)
            }
          >
            {note.length} / {EVIDENCE_NOTE_MAX}
          </span>
          {fieldError("evidence_note")}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.evidence_ref} className={ADMIN_LABEL_CLASS}>
            EVIDENCE REFERENCE
          </label>
          <input
            ref={refRef}
            id={ids.evidence_ref}
            type="text"
            value={ref}
            onChange={(e) => {
              setRef(e.target.value);
              clearError("evidence_ref");
            }}
            maxLength={EVIDENCE_REF_MAX}
            required
            placeholder="https://example.com/proof"
            inputMode="url"
            aria-invalid={errors.evidence_ref !== undefined}
            aria-describedby={describedBy("evidence_ref", `${ids.evidence_ref}-count`)}
            className={ADMIN_INPUT_CLASS}
          />
          <span
            id={`${ids.evidence_ref}-count`}
            className={
              "bcc-mono self-end text-[10px] " +
              counterToneClass(ref.length, EVIDENCE_REF_MAX, EVIDENCE_REF_MAX - 50)
            }
          >
            {ref.length} / {EVIDENCE_REF_MAX}
          </span>
          {fieldError("evidence_ref")}
        </div>

        <div className="flex justify-end">
          <button type="submit" className={ADMIN_PRIMARY_BUTTON_CLASS}>
            Link owner
          </button>
        </div>
      </form>

      {confirming && user !== null && evidenceType !== "" && (
        <StepUpDialog
          pageId={pageId}
          action="link_owner"
          targetUserId={user.user_id}
          title={LINK_COPY.heading}
          write={{
            isPending: link.isPending,
            reset: link.reset,
            run: (proof, onError) =>
              link.mutate(
                {
                  user_id: user.user_id,
                  role: "owner",
                  verification_method: evidenceType,
                  evidence_note: trimmedNote,
                  evidence_ref: trimmedRef,
                  ...proof,
                },
                {
                  onSuccess: () => {
                    closeDialog();
                    onNotice({ tone: "status", text: LINK_COPY.linked });
                  },
                  onError,
                },
              ),
          }}
          onConflict={(message) => {
            closeDialog();
            onNotice({ tone: "alert", text: message });
          }}
          onFieldError={(serverField) => {
            const field = SERVER_FIELD[serverField];
            if (field === undefined) return false;
            closeDialog();
            setErrors({ [field]: LINK_COPY.rejected });
            // After the dialog has handed focus back to its trigger.
            window.setTimeout(() => focusField(field), 0);
            return true;
          }}
          onClose={closeDialog}
        />
      )}
    </>
  );
}
