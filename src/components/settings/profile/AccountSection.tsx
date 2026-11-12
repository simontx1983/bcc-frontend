"use client";

/**
 * AccountSection — the SIGN-IN section of the Account sub-tab.
 *
 * Two sub-cards, each confirmed by the user's current password — or, for
 * an account with NO password, a wallet signature (F-253, AccountConfirm):
 *   1. Change email
 *   2. Change password (for a wallet-only account: set a first password)
 *
 * Account deletion used to be a third sibling here. It now lives alone
 * in the Danger Zone (`DeleteAccountCard`) so an irreversible action no
 * longer shares the visual rhythm of a routine save.
 *
 * Helper and validation text is associated with its inputs through
 * `aria-describedby`. IDs are minted with `useId` because a card can in
 * principle be rendered more than once, and duplicate IDs would silently
 * mis-associate the descriptions.
 */

import { useId, useRef, useState } from "react";
import {
  AccountConfirmField,
  humanizeConfirmError,
  useAccountConfirm,
} from "@/components/settings/profile/AccountConfirm";
import { SettingsSaveStatus } from "@/components/settings/SettingsSaveStatus";
import { useDirtyRegistration } from "@/hooks/useDirtyRegistration";

import {
  useChangeAccountEmail,
  useChangeAccountPassword,
  useVerifyAccountEmailChange,
} from "@/hooks/useAccount";
import { humanizeCode } from "@/lib/api/errors";
import { BccApiError, type VerifyAccountEmailChangeErrorCode } from "@/lib/api/types";
import { endSession } from "@/lib/auth/session-boundary";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request:    "Check the values and try again.",
  bcc_unauthorized:       "Sign in required.",
  bcc_forbidden:          "Not allowed.",
  bcc_conflict:           "Already in use.",
  bcc_internal_error:     "Server error. Try again.",
  // The credential-gated routes (email / password / delete) sit behind
  // a per-user 60s Throttle so the current_password brute-force surface
  // is itself rate-limited. Tell the user the cooldown is short so they
  // don't escalate to support thinking they're locked out.
  bcc_rate_limited:       "Too many attempts. Wait a minute and try again.",
};

function humanizeError(err: BccApiError | Error): string {
  // §γ — keyed on err.code; unmapped codes fall back to generic copy,
  // never the server's raw err.message.
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? "Something went wrong. Try again.";
  }
  return "Something went wrong. Try again.";
}

/**
 * Password-change errors specifically, because this is the one mutation
 * where "it failed" may be WRONG.
 *
 * Everything after `patchAccountPassword` resolves is already fenced off
 * from the failure path. A throw FROM it is the remaining ambiguity: the
 * server commits the rotation and sends the notification email before the
 * response is written, so a dropped connection, or a 200 whose body is not
 * our envelope (a CDN interstitial, a PHP notice prefixed to the JSON),
 * reaches us as an error with the credential ALREADY CHANGED.
 *
 * Saying "try again" there invites a resubmission whose `current_password`
 * is now the old one. That is rejected, and the viewer reasonably concludes
 * the change never worked — while every other device has been signed out.
 * So these cases say what is known and point at the email, which has
 * already been sent and is a reliable tiebreaker.
 */
function humanizePasswordError(err: BccApiError | Error): string {
  // The predicate is DEFINITE-ness, not a list of indeterminate codes.
  // Listing codes was too narrow: `wp_set_password` commits first
  // (MyAccountEndpoint.php:223) and the controller has no catch, so a
  // fatal in any later step — token revocation, the audit write, the
  // notification mail — returns WordPress's own fatal response. For a
  // JSON request that is VALID JSON of the wrong shape, so the client
  // throws `bcc_unexpected_status` rather than `bcc_invalid_response`,
  // and that code is unmapped, so the copy was "Something went wrong.
  // Try again." for a password that had already changed. `bcc_internal_error`
  // is mapped, to the equally definite "Server error. Try again."
  //
  // Every pre-commit rejection on this route answers with a 4xx envelope
  // carrying a mapped code — 429 rate limit (checked before the password
  // is verified), 401, 422 — so nothing definite becomes indeterminate.
  const definite =
    err instanceof BccApiError &&
    err.status >= 400 &&
    err.status < 500 &&
    ERROR_COPY[err.code] !== undefined;
  if (!definite) {
    // Leads with the instruction the viewer can always act on. The email
    // is a HEDGE, not the tiebreaker it was first written as: the mailer
    // runs at MyAccountEndpoint.php:250, AFTER revokeAllForUser, the token
    // mint and the audit write — so a fatal in exactly the post-commit
    // steps this branch was widened to cover leaves the password rotated
    // and no email sent. Someone told to check their email, finding
    // nothing, would conclude the change had not landed.
    return "We couldn't confirm whether the change went through. Try signing in with your new password before changing it again — you may also receive a password-change notice by email.";
  }
  return humanizeError(err);
}

interface AccountSectionProps {
  currentEmail: string;
}

export function AccountSection({ currentEmail }: AccountSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <ChangeEmailCard currentEmail={currentEmail} />
      <ChangePasswordCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────

function ChangeEmailCard({ currentEmail }: { currentEmail: string }) {
  const uid = useId();
  const helpId = `${uid}-email-help`;
  const codeHelpId = `${uid}-email-code-help`;
  const [email, setEmail] = useState(currentEmail);
  // `currentEmail` is a server-component prop and does not update when the
  // change succeeds, so it cannot serve as the baseline — comparing against
  // it would leave the form permanently dirty after a successful save. This
  // records what the server confirmed.
  const [confirmedEmail, setConfirmedEmail] = useState(currentEmail);
  // The confirmation (current password, or a wallet signature for an
  // account with no password — F-253). A typed password is held for the
  // life of the form ONLY — React state, never storage — so "Resend code"
  // can repeat the PATCH, which re-verifies it; in wallet mode a resend
  // signs a fresh challenge. Cleared on a confirmed change and on Cancel.
  const confirm = useAccountConfirm("confirm_email_change");
  // Step 1 (the address + password form) vs step 2 (code entry). Step 2
  // remembers the exact address the code was sent for, so a resend repeats
  // the same body even if the step-1 field is edited meanwhile.
  const [step, setStep] = useState<EmailStep>({ kind: "form" });
  const [code, setCode] = useState("");
  /** Step-1 failures, including a verify that sent the viewer back here. */
  const [serverError, setServerError] = useState<string | null>(null);
  /** Step-2 failures; the code form stays open. */
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Neutral, non-error outcomes ("already your email", "new code sent"). */
  const [notice, setNotice] = useState<string | null>(null);
  /** Set ONLY by a successful verify — never by the PATCH. */
  const [changedTo, setChangedTo] = useState<string | null>(null);
  // The address changed but the replacement bearer did not land, so this
  // device is holding a revoked one. Same state as the password card's.
  const [sessionLost, setSessionLost] = useState(false);
  // Which PATCH is in flight: the step-1 submit or a step-2 resend. The
  // outcome is handled differently, and the hook-level callbacks cannot
  // see the call site.
  const requestMode = useRef<"submit" | "resend">("submit");
  // Same double-submit fence as the password card: `canSubmit` is derived
  // during render, so two clicks in one commit both pass it.
  const inFlight = useRef(false);

  const request = useChangeAccountEmail({
    onSuccess: (res, body) => {
      setServerError(null);
      setCodeError(null);
      if (res.pending) {
        setStep({
          kind: "code",
          email: body.email,
          emailMasked: res.email_masked,
          expiresIn: res.expires_in,
        });
        setNotice(requestMode.current === "resend" ? "A new code was sent." : null);
        return;
      }
      // Already the account's address: nothing changed and nothing to
      // confirm. The password has done its job.
      setStep({ kind: "form" });
      setCode("");
      confirm.clear();
      setNotice("That's already your email.");
    },
    onError: (err) => {
      setNotice(null);
      if (requestMode.current === "resend" && !isConflict(err)) {
        setCodeError(humanizeConfirmError(err, confirm.mode) ?? humanizeError(err));
        return;
      }
      // A step-1 failure, or a resend whose address was taken meanwhile —
      // that one cannot be fixed from the code form.
      setStep({ kind: "form" });
      setCode("");
      setServerError(
        isConflict(err)
          ? "That email is already in use by another account."
          : (humanizeConfirmError(err, confirm.mode) ?? humanizeError(err)),
      );
    },
    onSettled: () => {
      inFlight.current = false;
      // Drop the plaintext current_password `mutate()` parked in the
      // MutationCache as `variables` (see ChangePasswordCard).
      request.reset();
    },
  });

  const verify = useVerifyAccountEmailChange({
    onSuccess: (outcome) => {
      // The hook has already swapped the bearer and issued the query
      // invalidations; only now does the UI say the email changed.
      setStep({ kind: "form" });
      setCode("");
      confirm.clear();
      setServerError(null);
      setCodeError(null);
      setNotice(null);
      setEmail(outcome.email);
      setConfirmedEmail(outcome.email);
      setChangedTo(outcome.email);
      setSessionLost(!outcome.sessionRestored);
    },
    onError: (err) => {
      const verdict = classifyVerifyError(err);
      setNotice(null);
      if (verdict.restart) {
        setStep({ kind: "form" });
        setCode("");
        setCodeError(null);
        setServerError(verdict.message);
        return;
      }
      setCodeError(verdict.message);
    },
    onSettled: () => {
      inFlight.current = false;
      verify.reset();
    },
  });

  const busy = request.isPending || verify.isPending || confirm.signing;
  const dirty = email.trim() !== confirmedEmail.trim();
  const canSubmit = dirty && email.trim() !== "" && confirm.ready && !busy;
  const canConfirm = code.length === CODE_LENGTH && !busy;

  // A typed-but-unsubmitted password, or a change waiting on its code, is
  // lost work too, so it counts — but only as a boolean. No value ever
  // leaves this component.
  useDirtyRegistration({
    id: "account.email",
    label: "your email address",
    isDirty: dirty || confirm.password !== "" || step.kind === "code",
    isSaving: busy,
  });

  async function sendRequest(mode: "submit" | "resend", targetEmail: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    requestMode.current = mode;
    setServerError(null);
    setCodeError(null);
    setNotice(null);
    setChangedTo(null);
    // A typed password goes out in the same tick, as it always did; only a
    // wallet signature has to be awaited.
    if (confirm.mode === "password") {
      request.mutate({ current_password: confirm.password, email: targetEmail });
      return;
    }
    let credential;
    try {
      // Wallet mode signs here, at submit: the challenge is single-use.
      credential = await confirm.credential();
    } catch (err) {
      inFlight.current = false;
      const text =
        humanizeConfirmError(err, confirm.mode) ?? "Couldn't get a signature from your wallet. Try again.";
      if (mode === "resend") setCodeError(text);
      else setServerError(text);
      return;
    }
    request.mutate({ ...credential, email: targetEmail });
  }

  function cancel() {
    setStep({ kind: "form" });
    setCode("");
    confirm.clear();
    setCodeError(null);
    setNotice(null);
  }

  if (sessionLost && changedTo !== null) {
    return (
      <section className="bcc-panel p-5">
        <h3 className="bcc-stencil text-lg text-bcc-text">Email changed</h3>
        <p role="status" className="bcc-mono mt-2 text-[11px] text-bcc-text-secondary">
          Your email was changed to {changedTo}. We couldn&apos;t keep this
          device signed in, so you&apos;ll need to sign in again.
        </p>
        {/* A button that ends the session, not a /login link — see the
            password card: the cookie survives, only the bearer is dead. */}
        <button
          type="button"
          onClick={() => {
            void endSession("user", { callbackUrl: "/login" });
          }}
          className="bcc-auth-submit mt-4 inline-flex items-center justify-center"
        >
          Sign in again
        </button>
      </section>
    );
  }

  if (step.kind === "code") {
    const minutes = Math.max(1, Math.round(step.expiresIn / 60));
    return (
      <section className="bcc-panel p-5">
        <h3 className="bcc-stencil text-lg text-bcc-text">Change email</h3>
        <p id={codeHelpId} className="font-serif mt-1 text-[13px] text-bcc-text-secondary">
          We sent a code to {step.emailMasked}. Enter it to confirm the change.
          The code is valid for {minutes} minutes, and your email stays the same
          until it is confirmed.
        </p>

        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canConfirm || inFlight.current) return;
            inFlight.current = true;
            setCodeError(null);
            setNotice(null);
            verify.mutate(code);
          }}
        >
          <Field label="Verification code">
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH))
              }
              disabled={busy}
              aria-describedby={codeHelpId}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
              className={`${fieldClass} bcc-mono tracking-[0.3em]`}
            />
          </Field>

          {codeError !== null && (
            <p role="alert" className="bcc-mono text-[11px] text-bcc-text-error">
              {codeError}
            </p>
          )}
          {notice !== null && (
            <p role="status" className="bcc-mono text-[11px] text-bcc-text-secondary">
              {notice}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void sendRequest("resend", step.email)}
                disabled={busy}
                className={textButtonClass}
              >
                {confirm.signing ? "Waiting for wallet…" : request.isPending ? "Sending…" : "Resend code"}
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className={textButtonClass}
              >
                Cancel
              </button>
            </div>
            <button
              type="submit"
              disabled={!canConfirm}
              className="bcc-stencil bg-ink px-4 py-2 text-cardstock transition disabled:opacity-50"
            >
              {verify.isPending ? "Confirming…" : "Confirm"}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="bcc-panel p-5">
      <h3 className="bcc-stencil text-lg text-bcc-text">Change email</h3>
      <p id={helpId} className="bcc-mono mt-1 text-[10px] text-bcc-text-secondary">
        {confirm.mode === "wallet" || confirm.mode === "no-wallet"
          ? "We'll need a signature from your wallet, then a code sent to the new address to confirm."
          : "We'll need your current password, then a code sent to the new address to confirm."}
      </p>

      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          void sendRequest("submit", email.trim());
        }}
      >
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            aria-describedby={helpId}
            required
            className={fieldClass}
          />
        </Field>
        <AccountConfirmField
          confirm={confirm}
          disabled={busy}
          describedBy={helpId}
          inputClassName={fieldClass}
        />

        {changedTo !== null && (
          <p role="status" className="bcc-mono text-[11px] text-bcc-success">
            Email changed to {changedTo}.
          </p>
        )}
        {notice !== null && (
          <p role="status" className="bcc-mono text-[11px] text-bcc-text-secondary">
            {notice}
          </p>
        )}

        <SaveRow
          serverError={serverError}
          // Never "Saved" from step 1: the PATCH changes nothing.
          savedAt={null}
          busy={request.isPending || confirm.signing}
          canSubmit={canSubmit}
          label="Send code"
          busyLabel={confirm.signing ? "Waiting for wallet…" : "Sending…"}
        />
      </form>
    </section>
  );
}

type EmailStep =
  | { kind: "form" }
  | { kind: "code"; email: string; emailMasked: string; expiresIn: number };

/** The server mails a 6-digit code (PendingEmailService). */
const CODE_LENGTH = 6;

const textButtonClass =
  "bcc-mono px-1 py-2 text-[11px] tracking-[0.14em] text-bcc-text-secondary hover:text-bcc-text disabled:opacity-50";

function isConflict(err: BccApiError | Error): boolean {
  return err instanceof BccApiError && err.code === "bcc_conflict";
}

/**
 * Copy for a verify failure that keeps the code form open, keyed on
 * `err.code`. `bcc_invalid_request` reaches this table only as the 422
 * empty-code case; the "no pending change" case restarts first.
 */
const VERIFY_ERROR_COPY: Record<VerifyAccountEmailChangeErrorCode, string> = {
  bcc_invalid_otp:     "That code didn't match. Check the latest email and try again.",
  bcc_invalid_request: "Enter the 6-digit code from the email.",
  bcc_conflict:        "That email is already in use by another account.",
  bcc_rate_limited:    "Too many code attempts. Try again later.",
  bcc_internal_error:  "Server error. Try again.",
  bcc_unauthorized:    "Sign in required.",
};

/**
 * Not a definite rejection: a dropped connection or a response that is not
 * our envelope. The server may have applied the change before the
 * response was lost, so "try again" alone could be wrong — both addresses
 * get a change notice when it lands.
 */
const VERIFY_INDETERMINATE =
  "We couldn't confirm whether the change went through. Check both inboxes for an email-change notice before entering the code again.";

function classifyVerifyError(err: BccApiError | Error): {
  restart: boolean;
  message: string;
} {
  if (err instanceof BccApiError) {
    // Branch on the code. bcc_invalid_request means "no pending change"
    // (400); the status guard only keeps the 422 empty-code case, which
    // shares the code, on the code form instead of restarting.
    if (err.code === "bcc_invalid_request" && err.status !== 422) {
      return {
        restart: true,
        message:
          "There's no email change waiting to be confirmed — the code may have expired. Submit the new address again to get a new code.",
      };
    }
    if (err.code === "bcc_conflict") {
      return {
        restart: true,
        message:
          "That email was taken by another account before the change was confirmed. Choose a different address.",
      };
    }
  }
  return { restart: false, message: humanizeCode(err, VERIFY_ERROR_COPY, VERIFY_INDETERMINATE) };
}

// ─────────────────────────────────────────────────────────────────────
// Password
// ─────────────────────────────────────────────────────────────────────

function ChangePasswordCard() {
  const uid = useId();
  const helpId = `${uid}-pw-help`;
  const lengthId = `${uid}-pw-length`;
  const matchId = `${uid}-pw-match`;
  // Current password, or (an account with no password, F-253) a wallet
  // signature — which is how a wallet-only member sets a first password.
  const confirm = useAccountConfirm("confirm_password_change");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  // "The password changed but we could not keep you signed in." Distinct
  // from both success and failure, because it is BOTH: the credential is
  // already rotated, and the session is not recoverable from here.
  const [sessionLost, setSessionLost] = useState(false);
  // `canSubmit` is derived during render, so two submits in the same
  // commit interval both pass it. That matters here more than anywhere
  // else in the app: the fields are cleared only in onSuccess, so the
  // second submit sends the IDENTICAL body — the first commits, and the
  // second is rejected against the now-old current_password with a mapped
  // 422, which is classified `definite` and renders "Check the values and
  // try again." for a password that has already rotated.
  const submitting = useRef(false);

  const mutation = useChangeAccountPassword({
    onSuccess: (outcome) => {
      setServerError(null);
      confirm.clear();
      setNewPassword("");
      setConfirmPassword("");
      if (outcome.sessionRestored) {
        setSavedAt(Date.now());
        setSessionLost(false);
        return;
      }
      // Do NOT show the ordinary "Saved" affordance: it would imply the
      // viewer can carry on, and their next authed read will 401.
      setSavedAt(null);
      setSessionLost(true);
      // The notice is parked and withdrawn in useChangeAccountPassword,
      // atomically with the facts it describes. It is deliberately NOT
      // duplicated here: two call sites for one invariant is how they
      // drift.
    },
    onError: (err) => {
      setSavedAt(null);
      setSessionLost(false);
      setServerError(humanizeConfirmError(err, confirm.mode) ?? humanizePasswordError(err));
    },
    onSettled: () => {
      submitting.current = false;
      // Drop the plaintext credentials `mutate()` parked in the
      // MutationCache as `variables`. gcTime alone cannot collect them
      // while this component is still observing the mutation, which on
      // the success path is the whole time the settings page is mounted.
      mutation.reset();
    },
  });

  // Boolean only — no password value is ever handed to the dirty registry.
  useDirtyRegistration({
    id: "account.password",
    label: "your password",
    isDirty:
      confirm.password !== "" || newPassword !== "" || confirmPassword !== "",
    isSaving: mutation.isPending || confirm.signing,
  });

  const matches = newPassword === confirmPassword;
  const longEnough = newPassword.length >= 10;
  const showLengthError = newPassword !== "" && !longEnough;
  const showMatchError = confirmPassword !== "" && !matches;
  const canSubmit =
    confirm.ready &&
    longEnough &&
    matches &&
    !mutation.isPending &&
    !confirm.signing;
  const settingFirst = confirm.mode === "wallet" || confirm.mode === "no-wallet";

  if (sessionLost) {
    return (
      <section className="bcc-panel p-5">
        <h3 className="bcc-stencil text-lg text-bcc-text">Password changed</h3>
        <p role="alert" className="bcc-mono mt-2 text-[11px] text-bcc-text-secondary">
          Your password was changed successfully. We couldn&apos;t keep this
          device signed in, so you&apos;ll need to sign in again with your new
          password.
        </p>
        {/* No password fields and no retry: the change already succeeded,
            and offering the form again would invite a second submission
            whose current_password is now the OLD one — which would fail
            and read as "the change did not work".
            
            This is a BUTTON that ends the session, not a link to /login.
            A plain link was a dead end: login/page.tsx redirects any
            visitor holding a NextAuth session to /?authNotice=login, and
            in this state the cookie is still present — only the bearer is
            dead — so "Sign in again" bounced straight back to the feed.
            Going through the session boundary also clears this device's
            cached private data, which is the right thing to do after a
            credential rotation. */}
        <button
          type="button"
          onClick={() => {
            void endSession("user", { callbackUrl: "/login" });
          }}
          className="bcc-auth-submit mt-4 inline-flex items-center justify-center"
        >
          Sign in again
        </button>
      </section>
    );
  }

  return (
    <section className="bcc-panel p-5">
      <h3 className="bcc-stencil text-lg text-bcc-text">
        {settingFirst ? "Set a password" : "Change password"}
      </h3>
      <p id={helpId} className="bcc-mono mt-1 text-[10px] text-bcc-text-secondary">
        {settingFirst
          ? "Your account has no password yet. Set one to sign in with your email too. At least 10 characters."
          : "At least 10 characters. Every other signed-in device is signed out; this one stays signed in."}
      </p>

      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit || submitting.current) return;
          submitting.current = true;
          setServerError(null);
          setSavedAt(null);
          if (confirm.mode === "password") {
            mutation.mutate({ current_password: confirm.password, password: newPassword });
            return;
          }
          void (async () => {
            let credential;
            try {
              credential = await confirm.credential();
            } catch (err) {
              submitting.current = false;
              setServerError(
                humanizeConfirmError(err, confirm.mode) ??
                  "Couldn't get a signature from your wallet. Try again.",
              );
              return;
            }
            mutation.mutate({ ...credential, password: newPassword });
          })();
        }}
      >
        <AccountConfirmField
          confirm={confirm}
          disabled={mutation.isPending || confirm.signing}
          describedBy={helpId}
          inputClassName={fieldClass}
        />
        <Field label="New password">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={mutation.isPending}
            aria-describedby={showLengthError ? `${helpId} ${lengthId}` : helpId}
            aria-invalid={showLengthError}
            autoComplete="new-password"
            minLength={10}
            required
            className={fieldClass}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={mutation.isPending}
            aria-describedby={showMatchError ? matchId : undefined}
            aria-invalid={showMatchError}
            autoComplete="new-password"
            minLength={10}
            required
            className={fieldClass}
          />
        </Field>

        {showLengthError && (
          <p id={lengthId} className="bcc-mono text-[10px] text-bcc-text-error">
            Password must be at least 10 characters.
          </p>
        )}
        {showMatchError && (
          <p id={matchId} className="bcc-mono text-[10px] text-bcc-text-error">
            Passwords don&apos;t match.
          </p>
        )}

        <SaveRow
          serverError={serverError}
          savedAt={savedAt}
          busy={mutation.isPending || confirm.signing}
          canSubmit={canSubmit}
          label="Save password"
          busyLabel={confirm.signing ? "Waiting for wallet…" : "Saving…"}
        />
      </form>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared UI bits
// ─────────────────────────────────────────────────────────────────────

const fieldClass =
  "w-full border border-bcc-input-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-secondary">
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

function SaveRow({
  serverError,
  savedAt,
  busy,
  canSubmit,
  label,
  busyLabel = "Saving…",
}: {
  serverError: string | null;
  savedAt: number | null;
  busy: boolean;
  canSubmit: boolean;
  label: string;
  busyLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <SettingsSaveStatus
        status={
          serverError !== null
            ? "error"
            : savedAt !== null
              ? "saved"
              : busy
                ? "saving"
                : "idle"
        }
        errorMessage={serverError ?? undefined}
        savingLabel={busyLabel}
      />
      <button
        type="submit"
        disabled={!canSubmit}
        className="bcc-stencil bg-ink px-4 py-2 text-cardstock transition disabled:opacity-50"
      >
        {busy ? busyLabel : label}
      </button>
    </div>
  );
}
