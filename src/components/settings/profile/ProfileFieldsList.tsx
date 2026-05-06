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
  useProfileFields,
  useUpdateProfileFieldValue,
  useUpdateProfileFieldVisibility,
} from "@/hooks/useProfileFields";
import {
  type ProfileField,
  type ProfileFieldVisibility,
} from "@/lib/api/profile-fields-endpoints";
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
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? err.message;
  }
  return "Something went wrong. Try again.";
}

export function ProfileFieldsList() {
  const query = useProfileFields();

  if (query.isLoading) {
    return (
      <p className="bcc-mono py-4 text-[11px] text-cardstock-deep">Loading profile fields…</p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="bcc-mono py-4 text-[11px] text-safety">
        {humanizeError(query.error)}
      </p>
    );
  }

  const data = query.data;
  if (data === undefined || data.fields.length === 0) {
    return (
      <p className="bcc-mono py-4 text-[11px] text-cardstock-deep">
        Your administrator hasn't configured any profile fields yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {data.stats.total > 0 && (
        <div className="bcc-panel flex items-baseline justify-between px-4 py-3">
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
            COMPLETENESS
          </span>
          <span className="bcc-mono text-[11px] text-ink">
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
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // When the cache is updated by another row's mutation (or refetch),
  // sync the draft to the new authoritative value.
  useEffect(() => {
    setDraftValue(field.value);
    setDraftVisibility(field.visibility);
  }, [field.value, field.visibility]);

  const valueMutation = useUpdateProfileFieldValue({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });
  const visibilityMutation = useUpdateProfileFieldVisibility({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const valueDirty = useMemo(
    () => !valuesEqual(draftValue, field.value),
    [draftValue, field.value],
  );
  const visibilityDirty = draftVisibility !== field.visibility;

  const busy = valueMutation.isPending || visibilityMutation.isPending;

  function handleSave() {
    setServerError(null);
    setSavedAt(null);
    if (valueDirty) {
      valueMutation.mutate({ key: field.key, value: draftValue });
    }
    if (visibilityDirty) {
      visibilityMutation.mutate({ key: field.key, visibility: draftVisibility });
    }
  }

  return (
    <div className="bcc-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label
          htmlFor={`field-${field.key}`}
          className="bcc-mono text-[11px] tracking-[0.16em] text-ink"
        >
          {field.label.toUpperCase()}
          {field.required && <span className="ml-1 text-safety">*</span>}
        </label>
        <VisibilityPicker
          value={draftVisibility}
          onChange={setDraftVisibility}
          disabled={field.visibility_locked || busy}
          locked={field.visibility_locked}
        />
      </div>

      {field.help_text !== null && (
        <p className="bcc-mono mt-1 text-[10px] text-ink-soft">{field.help_text}</p>
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
          {serverError !== null && (
            <span role="alert" className="text-safety">{serverError}</span>
          )}
          {savedAt !== null && serverError === null && (
            <span role="status" style={{ color: "var(--verified)" }}>
              Saved.
            </span>
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
  const inputClass =
    "w-full border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint disabled:opacity-50";

  switch (field.type) {
    case "textarea":
      return (
        <textarea
          id={id}
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
                    ? "border-blueprint bg-blueprint/15 text-ink"
                    : "border-cardstock-edge text-ink-soft hover:border-ink/50")
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
}: {
  value: ProfileFieldVisibility;
  onChange: (v: ProfileFieldVisibility) => void;
  disabled: boolean;
  locked: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {locked && (
        <span
          className="bcc-mono text-[9px] tracking-[0.16em] text-ink-soft"
          title="Visibility for this field is set by the administrator and cannot be changed."
        >
          LOCKED
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ProfileFieldVisibility)}
        disabled={disabled}
        className="bcc-mono border border-cardstock-edge bg-cardstock-deep/60 px-2 py-1 text-[10px] tracking-[0.14em] text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint disabled:opacity-50"
        aria-label="Field visibility"
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

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function valuesEqual(
  a: string | string[],
  b: string | string[],
): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((v, i) => v === sortedB[i]);
  }
  return false;
}
