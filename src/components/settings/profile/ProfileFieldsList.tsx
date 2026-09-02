"use client";

/**
 * ProfileFieldsList — the About sub-tab on /settings/profile.
 *
 * Renders the admin-configured PeepSo profile-fields catalogue 1:1.
 * Each row exposes:
 *   - label + optional help text
 *   - value editor (control type chosen by `field.type`)
 *   - per-field visibility selector (Public / Members / Private),
 *     greyed out when `visibility_locked` is true
 *   - Save button per row — only enabled when the local draft differs
 *     from the server value
 *
 * Loading and error states ride at the section level. Per-row mutation
 * states ride beside each row's Save button.
 */

import { useEffect, useMemo, useState } from "react";

import {
  profileFieldValuesEqual,
  useProfileFields,
  useUpdateProfileFieldValue,
  useUpdateProfileFieldVisibility,
} from "@/hooks/useProfileFields";
import { rowSaveOutcome } from "@/components/settings/profile/field-save-outcome";
import {
  type ProfileField,
  type ProfileFieldVisibility,
} from "@/lib/api/profile-fields-endpoints";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { SettingsSaveStatus } from "@/components/settings/SettingsSaveStatus";
import { useDirtyRegistration } from "@/hooks/useDirtyRegistration";
import { isNonRetryableFixedReadFailure } from "@/lib/api/errors";
import { BccApiError } from "@/lib/api/types";

const VISIBILITY_OPTIONS: ReadonlyArray<{
  value: ProfileFieldVisibility;
  label: string;
}> = [
  { value: "public",  label: "Public" },
  { value: "members", label: "Members" },
  { value: "private", label: "Private" },
];

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request:    "We couldn't accept that. Check the field and try again.",
  bcc_unauthorized:       "Sign in required.",
  bcc_forbidden:          "That field is locked.",
  bcc_not_found:          "Field not found.",
  bcc_peepso_unavailable: "Profile fields aren't available right now.",
  bcc_internal_error:     "Server error. Try again.",
};

function humanizeError(err: BccApiError | Error): string {
  // §γ — keyed on err.code; unmapped codes fall back to generic copy,
  // never the server's raw err.message.
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? "Something went wrong. Try again.";
  }
  return "Something went wrong. Try again.";
}

// `ERROR_COPY` above is shared with the two field mutations, so it also
// carries write-side codes that can reach this read. `useProfileFields()`
// takes no arguments — its queryFn is `({ signal }) => getProfileFields(signal)`
// — so a retry re-issues a byte-identical GET and the terminal codes
// cannot resolve. See isNonRetryableFixedReadFailure for the full rationale.

export function ProfileFieldsList() {
  const query = useProfileFields();

  if (query.isLoading) {
    return (
      <p className="bcc-mono py-4 text-[11px] text-bcc-text-secondary">Loading profile fields…</p>
    );
  }
  if (query.isError) {
    return (
      <LoadFailure
        message={humanizeError(query.error)}
        // Conditional spread rather than `onRetry={undefined}` —
        // `exactOptionalPropertyTypes` rejects the latter.
        {...(isNonRetryableFixedReadFailure(query.error)
          ? {}
          : { onRetry: () => void query.refetch() })}
      />
    );
  }

  const data = query.data;
  if (data === undefined || data.fields.length === 0) {
    return (
      <p className="bcc-mono py-4 text-[11px] text-bcc-text-secondary">
        Your administrator hasn&apos;t configured any profile fields yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {data.stats.total > 0 && (
        <div className="bcc-panel flex items-baseline justify-between px-4 py-3">
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary">
            COMPLETENESS
          </span>
          <span className="bcc-mono text-[11px] text-bcc-text">
            {data.stats.filled} / {data.stats.total} fields filled · {data.stats.completeness}%
          </span>
        </div>
      )}

      <ul className="flex flex-col gap-5">
        {data.fields.map((field) => (
          <li key={field.key}>
            <ProfileFieldRow field={field} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-field row
// ─────────────────────────────────────────────────────────────────────

function ProfileFieldRow({ field }: { field: ProfileField }) {
  const [draftValue, setDraftValue] = useState<string | string[]>(field.value);
  const [draftVisibility, setDraftVisibility] = useState<ProfileFieldVisibility>(
    field.visibility,
  );
  // Which halves the CURRENT attempt asked for. React Query keeps the
  // previous attempt's isSuccess/isError, so without this a retry of the
  // failed half would read the other half's stale success. Reset on every
  // save; see field-save-outcome.ts.
  const [requested, setRequested] = useState({ value: false, visibility: false });

  // Two effects, one per property, deliberately NOT one effect keyed on
  // both. Sharing an effect meant a successful VALUE merge also reset
  // draftVisibility — silently throwing away the visibility the user had
  // just chosen whenever that half failed, and flipping the row clean so
  // there was nothing left to retry.
  useEffect(() => {
    setDraftValue(field.value);
  }, [field.value]);
  useEffect(() => {
    setDraftVisibility(field.visibility);
  }, [field.visibility]);

  const valueMutation = useUpdateProfileFieldValue();
  const visibilityMutation = useUpdateProfileFieldVisibility();

  const valueDirty = useMemo(
    () => !profileFieldValuesEqual(draftValue, field.value),
    [draftValue, field.value],
  );
  const visibilityDirty = draftVisibility !== field.visibility;

  const busy = valueMutation.isPending || visibilityMutation.isPending;

  // One registration per field row — each row saves independently, so the
  // dialog can name exactly which field is unsaved. Reuses the row’s own
  // dirty computations rather than duplicating the comparison.
  useDirtyRegistration({
    id: `profile.field.${field.key}`,
    label: `your ${field.label.toLowerCase()}`,
    isDirty: valueDirty || visibilityDirty,
    isSaving: busy,
  });

  const outcome = rowSaveOutcome({
    requestedValue: requested.value,
    requestedVisibility: requested.visibility,
    value: valueMutation,
    visibility: visibilityMutation,
  });

  function handleSave() {
    // Snapshot what this attempt covers BEFORE firing, and reset the
    // mutations so a previous attempt's terminal state can't be read as
    // this one's result.
    const wantValue = valueDirty;
    const wantVisibility = visibilityDirty;
    if (!wantValue && !wantVisibility) return;
    valueMutation.reset();
    visibilityMutation.reset();
    setRequested({ value: wantValue, visibility: wantVisibility });
    if (wantValue) {
      valueMutation.mutate({ key: field.key, value: draftValue });
    }
    if (wantVisibility) {
      visibilityMutation.mutate({ key: field.key, visibility: draftVisibility });
    }
  }

  return (
    <div className="bcc-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label
          htmlFor={`field-${field.key}`}
          className="bcc-mono text-[11px] tracking-[0.16em] text-bcc-text"
        >
          {field.label.toUpperCase()}
          {/* The bare coloured asterisk carried this in colour alone, and
              nothing told assistive tech the field was required. */}
          {field.required && (
            <span className="ml-2 text-safety">Required</span>
          )}
        </label>
        <VisibilityPicker
          value={draftVisibility}
          onChange={setDraftVisibility}
          disabled={field.visibility_locked || busy}
          locked={field.visibility_locked}
          fieldLabel={field.label}
        />
      </div>

      {field.help_text !== null && (
        <p
          id={`field-${field.key}-help`}
          className="bcc-mono mt-1 text-[10px] text-bcc-text-secondary"
        >
          {field.help_text}
        </p>
      )}

      <div className="mt-3">
        <FieldInput
          field={field}
          value={draftValue}
          onChange={setDraftValue}
          disabled={!field.editable || busy}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="bcc-mono min-h-[1rem] text-[10px]">
          {/* Progress and success ride the shared polite region. A failure
              is an alert instead, and `status` is never "error" here, so
              the polite region renders empty and one outcome is never
              announced by two regions. The partial-failure wording does
              not fit SettingsSaveStatus's "Couldn't save — {reason}"
              template, which is the other reason it lives out here. */}
          <SettingsSaveStatus status={outcome.status} />
          {outcome.errorMessage !== null && (
            <p role="alert" className="mt-1 text-safety">
              {outcome.errorMessage}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={busy || (!valueDirty && !visibilityDirty) || !field.editable}
          onClick={handleSave}
          className="bcc-stencil bg-ink px-4 py-1.5 text-[11px] text-cardstock transition disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────

interface FieldInputProps {
  field: ProfileField;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  disabled: boolean;
}

function FieldInput({ field, value, onChange, disabled }: FieldInputProps) {
  const id = `field-${field.key}`;
  // Help text used to be a loose sibling paragraph — visible, but never
  // announced with the control it explains. `required` was an unlabelled
  // coloured asterisk. Both are spread onto every branch below so no
  // control type can quietly miss them. Conditional spread rather than
  // `undefined` values, for exactOptionalPropertyTypes.
  const a11y = {
    ...(field.help_text !== null ? { "aria-describedby": `${id}-help` } : {}),
    ...(field.required ? { "aria-required": true } : {}),
  } as const;
  const inputClass =
    "w-full border border-bcc-input-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50";

  switch (field.type) {
    case "textarea":
      return (
        <textarea
          id={id}
          {...a11y}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
          maxLength={field.max_length ?? undefined}
          className={`resize-y ${inputClass}`}
        />
      );

    case "date":
      return (
        <input
          id={id}
          {...a11y}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      );

    case "url":
      return (
        <input
          id={id}
          {...a11y}
          type="url"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={field.max_length ?? undefined}
          placeholder="https://"
          className={inputClass}
        />
      );

    case "email":
      return (
        <input
          id={id}
          {...a11y}
          type="email"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={field.max_length ?? undefined}
          className={inputClass}
        />
      );

    case "select_single":
    case "country": {
      const options = field.options ?? [];
      const stringValue = typeof value === "string" ? value : "";
      return (
        <select
          id={id}
          {...a11y}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    case "select_bool": {
      const stringValue = typeof value === "string" ? value : "";
      const options = field.options ?? [
        { value: "1", label: "Yes" },
        { value: "0", label: "No" },
      ];
      return (
        <div className="flex gap-3">
          {options.map((opt) => (
            <label key={opt.value} className="bcc-mono flex items-center gap-2 text-[11px]">
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={stringValue === opt.value}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
              />
              {opt.label}
            </label>
          ))}
        </div>
      );
    }

    case "select_multi": {
      const options = field.options ?? [];
      const arrValue = Array.isArray(value) ? value : [];
      const toggle = (v: string) => {
        const next = arrValue.includes(v)
          ? arrValue.filter((x) => x !== v)
          : [...arrValue, v];
        onChange(next);
      };
      return (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const selected = arrValue.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={
                  "bcc-mono inline-flex cursor-pointer items-center gap-2 border-2 px-3 py-1 text-[11px] transition " +
                  (selected
                    ? "border-bcc-accent bg-bcc-accent-subtle text-bcc-text"
                    : "border-bcc-border text-bcc-text-secondary hover:border-bcc-border-strong")
                }
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(opt.value)}
                  disabled={disabled}
                  className="hidden"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      );
    }

    case "location":
    case "text":
    default:
      return (
        <input
          id={id}
          {...a11y}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={field.max_length ?? undefined}
          className={inputClass}
        />
      );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Visibility picker
// ─────────────────────────────────────────────────────────────────────

function VisibilityPicker({
  value,
  onChange,
  disabled,
  locked,
  fieldLabel,
}: {
  value: ProfileFieldVisibility;
  onChange: (v: ProfileFieldVisibility) => void;
  disabled: boolean;
  locked: boolean;
  /** Makes the accessible name unique per row — see the aria-label below. */
  fieldLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {locked && (
        <span
          className="bcc-mono text-[9px] tracking-[0.16em] text-bcc-text-secondary"
          title="Visibility for this field is set by the administrator and cannot be changed."
        >
          LOCKED
        </span>
      )}
      {/* Every row used to announce the identical "Field visibility", so a
          screen-reader user heard the same name N times with no way to tell
          which field they were changing. */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ProfileFieldVisibility)}
        disabled={disabled}
        className="bcc-mono border border-bcc-input-border bg-bcc-input-bg px-2 py-1 text-[10px] tracking-[0.14em] text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50"
        aria-label={`Who can see ${fieldLabel}`}
      >
        {VISIBILITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Value comparison lives with the cache merge that also needs it —
// `profileFieldValuesEqual` in hooks/useProfileFields.ts. Keeping a second
// copy here would let the row's dirty check and the cache's change check
// drift apart, which is exactly the kind of disagreement that produced the
// clobbering bug the merge fix addresses.
