"use client";

/**
 * HandleSection — change your handle (F-333).
 *
 * Editing was withdrawn while a rename broke the account: old /u/ links
 * 404'd, the session kept the old handle, and sign-in by the new handle
 * failed. The backend has since fixed all three (contract §4 PATCH
 * /me/handle, v1.128 F-280 and #634): the old handle is RETIRED, so it
 * keeps resolving to this member (the profile route 308s to the current
 * one), no one else can take it, the owner may reclaim it, and sign-in
 * works by the current handle. The session handle is refreshed from the
 * server after a rename (useUpdateHandle → lib/auth.ts).
 *
 * The form:
 *   - checks the shape as you type with the SAME rules as signup
 *     (lib/auth/handleValidation); availability is the server's call —
 *     there is deliberately no public availability probe, so "taken" is
 *     only known on submit (409);
 *   - confirms before saving, because of the 7-day cooldown;
 *   - while the cooldown runs, says when the next change is allowed and
 *     offers no Save (profile-prefs `handle_next_change_at`, #653);
 *   - reports every error by code, never the server's message (§γ).
 */

import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useProfilePrefs } from "@/hooks/useProfilePrefs";
import { useUpdateHandle, type HandleUpdateResult } from "@/hooks/useUpdateHandle";
import { humanizeCode } from "@/lib/api/errors";
import { BccApiError } from "@/lib/api/types";
import { checkHandleLocal, formatHandleHint } from "@/lib/auth/handleValidation";
import { formatAbsoluteDateTime } from "@/lib/format";

interface HandleSectionProps {
  handle: string;
}

/** The cooldown date, when the server says (SA7 may add it to the 429). */
function cooldownDate(err: unknown): string | null {
  if (!(err instanceof BccApiError)) return null;
  const data = err.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const at = (data as Record<string, unknown>)["next_change_at"];
  return typeof at === "string" && at !== "" ? at : null;
}

export function humanizeHandleError(err: unknown): string {
  if (err instanceof BccApiError && err.code === "bcc_rate_limited") {
    const at = cooldownDate(err);
    return at !== null
      ? `You changed your handle recently. You can change it again on ${formatAbsoluteDateTime(at)}.`
      : "You changed your handle recently, or tried too many times. Handles can change once every 7 days — try again later.";
  }
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in again to change your handle.",
      bcc_forbidden: "Your account can't change its handle right now.",
      bcc_invalid_handle: "That handle isn't allowed. Use 3–20 characters: a–z, 0–9 and single hyphens.",
      bcc_handle_reserved: "That handle is reserved. Pick something else.",
      bcc_conflict: "That handle is already taken.",
      bcc_internal_error: "Couldn't save your new handle. Nothing changed — try again.",
    },
    "Couldn't change your handle. Try again.",
  );
}

export function HandleSection({ handle }: HandleSectionProps) {
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState(handle);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<HandleUpdateResult | null>(null);
  const mutation = useUpdateHandle();
  const prefs = useProfilePrefs();

  // Cooldown: the date the server says (or the one this rename just armed).
  const nextChangeAt = done?.next_change_at ?? prefs.data?.handle_next_change_at ?? null;
  const lockedUntil =
    nextChangeAt !== null && Number.isFinite(Date.parse(nextChangeAt)) && Date.parse(nextChangeAt) > Date.now()
      ? nextChangeAt
      : null;

  const next = draft.trim().toLowerCase();
  const kind = checkHandleLocal(next);
  const changed = next !== "" && next !== handle;
  const canSave = changed && kind === null && !mutation.isPending && lockedUntil === null;
  const serverError = mutation.isError ? humanizeHandleError(mutation.error) : null;

  const save = () => {
    setConfirming(false);
    setDone(null);
    mutation.mutate(next, { onSuccess: (result) => setDone(result) });
  };

  return (
    <div className="bcc-panel p-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) setConfirming(true);
        }}
      >
        <label htmlFor={inputId} className="bcc-mono text-[11px] tracking-[0.16em] text-bcc-text">
          YOUR HANDLE
        </label>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          <span className="bcc-mono text-bcc-text-secondary">bluecollarcrypto.io/u/</span>
          <input
            id={inputId}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDone(null);
              mutation.reset();
            }}
            disabled={mutation.isPending || lockedUntil !== null}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            aria-describedby={hintId}
            aria-invalid={kind !== null}
            className="bcc-mono min-h-[44px] w-full max-w-[16rem] border border-bcc-input-border bg-bcc-input-bg px-3 py-2 text-[14px] text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50"
          />
        </div>
        <p
          id={hintId}
          className={`bcc-mono text-[10px] ${kind === null ? "text-bcc-text-secondary" : "text-bcc-text-error"}`}
        >
          {formatHandleHint(next, kind)} Old links to your profile keep working after a change. You can
          change your handle once every 7 days.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="bcc-mono min-h-[1rem] text-[11px]">
            {lockedUntil !== null && done === null && (
              <p className="text-bcc-text-secondary">
                {`You can change your handle again on ${formatAbsoluteDateTime(lockedUntil)}.`}
              </p>
            )}
            {serverError !== null && (
              <p role="alert" className="text-bcc-text-error">
                {serverError}
              </p>
            )}
            {done !== null && done.next_change_at !== null && (
              <p role="status" className="text-bcc-text-secondary">
                {`Your handle is now @${done.handle}. Old links still work. Next change: ${formatAbsoluteDateTime(done.next_change_at)}.`}
                {done.sessionRefreshed
                  ? ""
                  : " Some parts of the site may show your old handle until you sign in again."}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={!canSave}
            className="bcc-stencil min-h-[44px] bg-ink px-4 text-[11px] text-cardstock transition disabled:opacity-40"
          >
            {mutation.isPending ? "Saving…" : "Change handle"}
          </button>
        </div>
      </form>

      {confirming && (
        <ConfirmDialog
          title={`Change your handle to @${next}?`}
          body={`Old links and @mentions keep pointing to you, and nobody else can take @${handle}. You won't be able to change your handle again for 7 days.`}
          confirmLabel="CHANGE HANDLE"
          cancelLabel="CANCEL"
          pending={false}
          onConfirm={save}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
