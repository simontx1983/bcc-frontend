"use client";

/**
 * DeleteAccountCard — the Danger Zone, and the only thing in it.
 *
 * Extracted out of `AccountSection`, where it sat as the third sibling
 * card beneath Change email and Change password. Nothing but colour
 * separated an irreversible action from two routine ones, so it shared
 * the visual rhythm of an ordinary save.
 *
 * ## What is deliberately NOT changed
 *
 * The two gates stay exactly as they are: the user types `DELETE` and
 * supplies the current password — or, for an account with NO password, a
 * wallet signature (F-253, AccountConfirm) — and the server enforces both. This is
 * already a stronger, fully accessible confirmation than a generic
 * two-button dialog, so it is NOT wrapped in `ConfirmDialog` — that
 * would add a click without adding safety.
 *
 * The card also stays out of the unsaved-changes registry. Abandoning a
 * deletion must remain frictionless; a "you have unsaved changes"
 * warning here would nudge the user back toward finishing it.
 *
 * ## What is added
 *
 * Focus lands on the DELETE field when the form opens and returns to the
 * trigger when it closes. Note that closing REMOUNTS the trigger — the
 * collapsed and expanded states are different renders — so the ref is
 * re-attached and a node captured before opening is detached afterwards.
 * Cancel clears the password. A one-shot latch stops a double-click
 * submitting twice: `mutation.isPending` alone lags a render, which is
 * how the same class of bug was measured firing twice during the PR #160
 * hardening pass.
 *
 * ## Colour
 *
 * The heading and trigger use `--bcc-danger`, not safety orange; the error
 * line uses the error-text token like every other error message (#205).
 * Safety (#f05a28) measures 3.39:1 on the light panel, under the 4.5:1
 * floor for normal text; danger measures 4.83 light / 4.60 dark. This
 * slice moved and redesigned the control, so its readability is this
 * slice's responsibility rather than a pre-existing theme migration.
 *
 * Destructive MEANING is not carried by the text colour: it is the
 * `border-safety` mark (3.39 light / 5.11 dark, both over the 3:1
 * non-text bar in 1.4.11), the Danger Zone the card sits in, and the
 * words themselves — so colour is never the only channel (1.4.1).
 */

import { useEffect, useId, useRef, useState } from "react";

import {
  AccountConfirmField,
  humanizeConfirmError,
  isWalletRefusal,
  useAccountConfirm,
} from "@/components/settings/profile/AccountConfirm";
import { useDeleteAccount } from "@/hooks/useAccount";
import { BccApiError } from "@/lib/api/types";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request: "Check the values and try again.",
  bcc_unauthorized:    "Sign in required.",
  // PeepSo's site_registration_allowdelete option can switch self-service
  // deletion off entirely; the server answers 403 and this is the polite
  // version of that.
  bcc_forbidden:       "Account deletion isn't available on this site. Contact an admin.",
  bcc_conflict:        "Already in use.",
  bcc_internal_error:  "Server error. Try again.",
  bcc_rate_limited:    "Too many attempts. Wait a minute and try again.",
};

function humanizeError(err: BccApiError | Error): string {
  // §γ — keyed on err.code; unmapped codes fall back to generic copy,
  // never the server's raw err.message.
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? "Something went wrong. Try again.";
  }
  return "Something went wrong. Try again.";
}

const fieldClass =
  "w-full border border-bcc-input-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50";

export function DeleteAccountCard() {
  // useId rather than a literal: a hardcoded id would collide if this card
  // were ever rendered twice, silently pointing both forms' descriptions
  // at the first one.
  const helpId = `${useId()}-delete-help`;
  const [showConfirm, setShowConfirm] = useState(false);
  const confirm = useAccountConfirm("confirm_account_delete");
  const [confirmText, setConfirmText] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [restoreFocus, setRestoreFocus] = useState(false);
  /** One-shot submit latch; released when a failure makes a retry valid. */
  const firedRef = useRef(false);

  const mutation = useDeleteAccount({
    onSuccess: (data) => {
      // Server has already torn down the auth cookie. Hard-navigate.
      window.location.href = data.logout_url || "/";
    },
    onError: (err) => {
      firedRef.current = false;
      if (isWalletRefusal(err, confirm.mode)) confirm.refresh();
      setServerError(humanizeConfirmError(err, confirm.mode) ?? humanizeError(err));
    },
  });

  useEffect(() => {
    if (!restoreFocus) return;
    triggerRef.current?.focus();
    setRestoreFocus(false);
  }, [restoreFocus]);

  const busy = mutation.isPending || confirm.signing;
  const canSubmit = confirm.ready && confirmText === "DELETE" && !busy;

  function closeForm() {
    setShowConfirm(false);
    // Never leave a password sitting in state behind a collapsed form.
    confirm.clear();
    setConfirmText("");
    setServerError(null);
    firedRef.current = false;
    setRestoreFocus(true);
  }

  if (!showConfirm) {
    return (
      <section className="bcc-panel border-2 border-safety/40 p-5">
        <h3 className="bcc-stencil text-lg text-bcc-danger">Delete account</h3>
        <p className="bcc-mono mt-1 text-[10px] text-bcc-text-secondary">
          Permanent. Most of your data is removed; messages you
          sent may remain in other members&apos; inboxes.
        </p>
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setShowConfirm(true)}
          className="bcc-mono mt-3 border-2 border-safety/70 px-4 py-2 text-[11px] tracking-[0.16em] text-bcc-danger transition hover:bg-safety/10"
        >
          Delete my account…
        </button>
      </section>
    );
  }

  return (
    <section className="bcc-panel border-2 border-safety/60 p-5">
      <h3 className="bcc-stencil text-lg text-bcc-danger">Delete account</h3>
      <p id={helpId} className="bcc-mono mt-1 text-[10px] text-bcc-text-secondary">
        This is permanent. To confirm, type{" "}
        <code className="bcc-mono text-bcc-text">DELETE</code> below and{" "}
        {confirm.mode === "wallet" || confirm.mode === "no-wallet"
          ? "sign with your wallet."
          : "enter your current password."}
      </p>

      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit || firedRef.current) return;
          firedRef.current = true;
          setServerError(null);
          // A typed password submits in the same tick (the double-submit
          // latch relies on it); only a wallet signature is awaited.
          if (confirm.mode === "password") {
            mutation.mutate({ current_password: confirm.password, confirm: "DELETE" });
            return;
          }
          void (async () => {
            let credential;
            try {
              credential = await confirm.credential();
            } catch (err) {
              firedRef.current = false;
              setServerError(
                humanizeConfirmError(err, confirm.mode) ??
                  "Couldn't get a signature from your wallet. Try again.",
              );
              return;
            }
            mutation.mutate({ ...credential, confirm: "DELETE" });
          })();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-secondary">
            TYPE DELETE TO CONFIRM
          </span>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={busy}
            aria-describedby={helpId}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            required
            className={fieldClass}
          />
        </label>
        <AccountConfirmField
          confirm={confirm}
          disabled={busy}
          describedBy={helpId}
          inputClassName={fieldClass}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="bcc-mono min-h-[1rem] text-[10px]">
            {serverError !== null && (
              <span role="alert" className="text-bcc-text-error">
                {serverError}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeForm}
              disabled={busy}
              className="bcc-mono px-3 py-2 text-[11px] tracking-[0.14em] text-bcc-text-secondary hover:text-bcc-text disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="bcc-stencil bg-safety px-4 py-2 text-bcc-on-accent transition disabled:opacity-50"
            >
              {confirm.signing ? "Waiting for wallet…" : mutation.isPending ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
