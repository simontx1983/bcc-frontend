"use client";

/**
 * TeamPermissions — the owner's grid of what each team role may do on
 * one validator page (validator admin V1, PR B2).
 *
 *   - One row per entry in `powers`, in the server's order, with its
 *     label and description and a checkbox per role.
 *   - Then the `locked` powers: disabled, with a lock and the server's
 *     `reason`. They're owner-only by code; their keys are never sent.
 *   - "Reset to defaults" fills the grid with `defaults` here; nothing
 *     is saved until Save.
 *   - Save asks for the owner's password and PUTs the FULL grid (every
 *     power key, both roles) with `current_password`. A 422 naming a key
 *     points at that row; a wrong password stays in the dialog.
 *
 * A failed read never falls back to the defaults: a 503 shows an error
 * with Retry and no grid at all. A 403 is "Only the owner can change
 * team permissions."
 */

import { Lock } from "lucide-react";
import { useId, useRef, useState } from "react";

import { AdminUserChip } from "@/components/admin/validators/AdminUserChip";
import {
  ADMIN_FIELD_ERROR_CLASS,
  ADMIN_OUTLINE_BUTTON_CLASS,
  ADMIN_PRIMARY_BUTTON_CLASS,
} from "@/components/admin/validators/form-classes";
import { PasswordConfirmDialog } from "@/components/validator-team/PasswordConfirmDialog";
import { TeamReadFailure } from "@/components/validator-team/TeamReadFailure";
import {
  isCredentialInvalid,
  ROLE_LABEL,
  TEAM_ERROR_COPY,
  teamWriteErrorCopy,
} from "@/components/validator-team/team-copy";
import { SKELETON_CLASS } from "@/components/ui/Skeleton";
import {
  mutateThenReset,
  useUpdateValidatorTeamPermissions,
  useValidatorTeamPermissions,
} from "@/hooks/useValidatorTeam";
import { invalidField, isAdminDenial } from "@/lib/api/admin-errors";
import { isServiceUnavailable } from "@/lib/api/errors";
import {
  BccApiError,
  type ValidatorTeamPermissions,
  type ValidatorTeamPower,
  type ValidatorTeamRole,
  type ValidatorTeamRoleGrants,
} from "@/lib/api/types";
import { formatAbsoluteDateTime } from "@/lib/format";

export const PERMISSIONS_COPY = {
  forbidden: "Only the owner can change team permissions.",
  unavailable: "Your team's permissions couldn't be read just now.",
  saved: "Saved. Your team's permissions are updated.",
  reset: "The defaults are filled in below. Save to apply them.",
  neverChanged: "No changes saved yet.",
  locked: "OWNER ONLY",
  rowRejected: "The server didn't accept this setting.",
  saveBody: "Saves these permissions for both roles. Enter your password to confirm.",
} as const;

const ROLES: readonly ValidatorTeamRole[] = ["administrator", "representative"];

const granted = (grants: ValidatorTeamRoleGrants, role: ValidatorTeamRole, key: string): boolean =>
  grants[role]?.[key] === true;

/**
 * The full grid for `powers` — every key, both roles, true or false — and
 * nothing else: a locked key never goes into a request.
 */
export function gridFor(
  grants: ValidatorTeamRoleGrants,
  powers: readonly ValidatorTeamPower[],
  lockedKeys: ReadonlySet<string>,
): ValidatorTeamRoleGrants {
  const out: ValidatorTeamRoleGrants = { administrator: {}, representative: {} };
  for (const role of ROLES) {
    for (const power of powers) {
      if (lockedKeys.has(power.key)) continue;
      out[role][power.key] = granted(grants, role, power.key);
    }
  }
  return out;
}

/** The power a 422's `data.field` names: the key itself, or a path ending in it. */
function powerForField(field: string, powers: readonly ValidatorTeamPower[]): string | null {
  for (const power of powers) {
    if (field === power.key || field.endsWith(`.${power.key}`) || field.endsWith(`[${power.key}]`)) {
      return power.key;
    }
  }
  return null;
}

export function TeamPermissions({ pageId }: { pageId: number }) {
  const query = useValidatorTeamPermissions(pageId);

  if (query.isPending) {
    return (
      <div>
        <p role="status" className="sr-only">
          Loading your team&apos;s permissions…
        </p>
        <div aria-hidden className={SKELETON_CLASS + " h-96"} />
      </div>
    );
  }

  // No grid beside a failed read: never the defaults in place of the settings.
  if (query.isLoadingError) {
    return (
      <TeamReadFailure
        error={query.error}
        unavailable={PERMISSIONS_COPY.unavailable}
        forbidden={PERMISSIONS_COPY.forbidden}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {query.isRefetchError && (
        <TeamReadFailure
          error={query.error}
          unavailable={PERMISSIONS_COPY.unavailable}
          forbidden={PERMISSIONS_COPY.forbidden}
          onRetry={() => void query.refetch()}
        />
      )}
      <PermissionsGrid pageId={pageId} data={query.data} />
    </div>
  );
}

function PermissionsGrid({ pageId, data }: { pageId: number; data: ValidatorTeamPermissions }) {
  const update = useUpdateValidatorTeamPermissions(pageId);
  // null: show the server's settings. Set by an edit or by Reset.
  const [draft, setDraft] = useState<ValidatorTeamRoleGrants | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const firstBoxes = useRef(new Map<string, HTMLInputElement>());
  const id = useId();

  const lockedKeys = new Set(data.locked.map((l) => l.key));
  const powers = data.powers.filter((p) => !lockedKeys.has(p.key));
  const grants = draft ?? data.roles;

  function toggle(role: ValidatorTeamRole, key: string) {
    const next = gridFor(grants, powers, lockedKeys);
    next[role][key] = !granted(grants, role, key);
    setDraft(next);
    setStatus(null);
    if (rowError === key) setRowError(null);
  }

  function closeSave() {
    setSaving(false);
  }

  function failedSave(err: unknown, fail: (message: string, clearPassword: boolean) => void) {
    if (isCredentialInvalid(err)) {
      fail(TEAM_ERROR_COPY.credentialInvalid, true);
      return;
    }
    const field = invalidField(err);
    if (field !== null) {
      const key = powerForField(field, powers);
      closeSave();
      if (key !== null) {
        setRowError(key);
        window.setTimeout(() => firstBoxes.current.get(key)?.focus(), 0);
      } else {
        setFormError(TEAM_ERROR_COPY.rejected);
      }
      return;
    }
    if (isAdminDenial(err)) {
      closeSave();
      setFormError(PERMISSIONS_COPY.forbidden);
      return;
    }
    if (
      isServiceUnavailable(err) ||
      !(err instanceof BccApiError) ||
      err.status === 429 ||
      err.status === 401
    ) {
      fail(teamWriteErrorCopy(err), false);
      return;
    }
    closeSave();
    setFormError(teamWriteErrorCopy(err));
  }

  const updated = data.updated_at;

  return (
    <section aria-label="Team permissions" className="bcc-panel flex flex-col gap-5 p-5 sm:p-6">
      <div className="bcc-mono flex flex-wrap items-center gap-2 text-[10px] tracking-[0.16em] text-bcc-text-secondary">
        {updated === null ? (
          <span>{PERMISSIONS_COPY.neverChanged.toUpperCase()}</span>
        ) : (
          <>
            <span>LAST CHANGED</span>
            <time dateTime={updated}>{formatAbsoluteDateTime(updated) || updated}</time>
            {data.updated_by !== null && (
              <>
                <span>BY</span>
                <AdminUserChip user={data.updated_by} size="xs" />
              </>
            )}
          </>
        )}
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (update.isPending) return;
          setFormError(null);
          setStatus(null);
          setSaving(true);
        }}
        className="flex flex-col gap-5"
      >
        <ul className="flex flex-col divide-y divide-bcc-border border-y border-bcc-border">
          {powers.map((power) => {
            const legendId = `${id}-${power.key}-legend`;
            const errorId = `${id}-${power.key}-error`;
            const invalid = rowError === power.key;
            return (
              <li key={power.key} className="py-4">
                <div
                  role="group"
                  aria-labelledby={legendId}
                  className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p id={legendId} className="font-serif text-bcc-text">
                      {power.label}
                    </p>
                    <p className="font-serif text-sm text-bcc-text-secondary">{power.description}</p>
                    {invalid && (
                      <p id={errorId} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
                        {PERMISSIONS_COPY.rowRejected}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-x-5">
                    {ROLES.map((role, i) => {
                      const boxId = `${id}-${power.key}-${role}`;
                      return (
                        <label
                          key={role}
                          htmlFor={boxId}
                          className="flex min-h-[44px] cursor-pointer items-center gap-2"
                        >
                          <input
                            ref={
                              i === 0
                                ? (el) => {
                                    if (el === null) firstBoxes.current.delete(power.key);
                                    else firstBoxes.current.set(power.key, el);
                                  }
                                : undefined
                            }
                            id={boxId}
                            type="checkbox"
                            checked={granted(grants, role, power.key)}
                            onChange={() => toggle(role, power.key)}
                            aria-labelledby={`${legendId} ${boxId}-label`}
                            aria-invalid={invalid || undefined}
                            aria-describedby={invalid ? errorId : undefined}
                            className="h-5 w-5 cursor-pointer accent-bcc-accent"
                          />
                          <span
                            id={`${boxId}-label`}
                            className="bcc-mono text-[11px] tracking-[0.12em] text-bcc-text"
                          >
                            {ROLE_LABEL[role]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {data.locked.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
              {PERMISSIONS_COPY.locked}
            </h2>
            <ul className="flex flex-col divide-y divide-bcc-border border-y border-bcc-border">
              {data.locked.map((power) => {
                const labelId = `${id}-locked-${power.key}`;
                const reasonId = `${id}-locked-${power.key}-reason`;
                return (
                  <li
                    key={power.key}
                    data-locked-key={power.key}
                    className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <p id={labelId} className="flex items-center gap-2 font-serif text-bcc-text">
                        <Lock aria-hidden className="h-3.5 w-3.5 shrink-0 text-bcc-text-secondary" />
                        {power.label}
                      </p>
                      <p id={reasonId} className="font-serif text-sm text-bcc-text-secondary">
                        {power.reason}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-x-5 opacity-60">
                      {ROLES.map((role) => (
                        <label key={role} className="flex min-h-[44px] cursor-not-allowed items-center gap-2">
                          <input
                            type="checkbox"
                            checked={false}
                            disabled
                            readOnly
                            aria-label={`${power.label}: ${ROLE_LABEL[role]}`}
                            aria-describedby={reasonId}
                            className="h-5 w-5 cursor-not-allowed"
                          />
                          <span className="bcc-mono text-[11px] tracking-[0.12em] text-bcc-text">
                            {ROLE_LABEL[role]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p role="status" className="font-serif text-bcc-text empty:hidden">
          {status ?? ""}
        </p>
        {formError !== null && (
          <p role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
            {formError}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(gridFor(data.defaults, powers, lockedKeys));
              setRowError(null);
              setFormError(null);
              setStatus(PERMISSIONS_COPY.reset);
            }}
            className={ADMIN_OUTLINE_BUTTON_CLASS}
          >
            Reset to defaults
          </button>
          <button
            type="submit"
            aria-disabled={update.isPending}
            aria-busy={update.isPending}
            className={ADMIN_PRIMARY_BUTTON_CLASS}
          >
            Save
          </button>
        </div>
      </form>

      {saving && (
        <PasswordConfirmDialog
          title="Save team permissions"
          body={PERMISSIONS_COPY.saveBody}
          confirmLabel="Save"
          pending={update.isPending}
          run={(password, fail) =>
            mutateThenReset(
              update,
              { roles: gridFor(grants, powers, lockedKeys), current_password: password },
              {
                onSuccess: () => {
                  closeSave();
                  setDraft(null);
                  setRowError(null);
                  setStatus(PERMISSIONS_COPY.saved);
                },
                onError: (err) => failedSave(err, fail),
              },
            )
          }
          onClose={closeSave}
        />
      )}
    </section>
  );
}
