"use client";

/**
 * AccountSection — the SIGN-IN section of the Account sub-tab.
 *
 * Two sub-cards, each requiring the user's current password:
 *   1. Change email
 *   2. Change password
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
import { SettingsSaveStatus } from "@/components/settings/SettingsSaveStatus";
import { useDirtyRegistration } from "@/hooks/useDirtyRegistration";

import {
  useChangeAccountEmail,
  useChangeAccountPassword,
} from "@/hooks/useAccount";
import { BccApiError } from "@/lib/api/types";
import {
  endSession,
  setPendingAuthNotice,
} from "@/lib/auth/session-boundary";

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
  const [email, setEmail] = useState(currentEmail);
  // `currentEmail` is a server-component prop and does not update when the
  // change succeeds, so it cannot serve as the baseline — comparing against
  // it would leave the form permanently dirty after a successful save. This
  // records what the server confirmed.
  const [confirmedEmail, setConfirmedEmail] = useState(currentEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useChangeAccountEmail({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
      setCurrentPassword("");
      setConfirmedEmail(email);
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const dirty = email.trim() !== confirmedEmail.trim();
  const canSubmit = dirty && email.trim() !== "" && currentPassword !== "" && !mutation.isPending;

  // A typed-but-unsubmitted password is lost work too, so it counts — but
  // only as a boolean. The value never leaves this component.
  useDirtyRegistration({
    id: "account.email",
    label: "your email address",
    isDirty: dirty || currentPassword !== "",
    isSaving: mutation.isPending,
  });

  return (
    <section className="bcc-panel p-5">
      <h3 className="bcc-stencil text-lg text-bcc-text">Change email</h3>
      <p id={helpId} className="bcc-mono mt-1 text-[10px] text-bcc-text-secondary">
        We&apos;ll need your current password to confirm.
      </p>

      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          setServerError(null);
          setSavedAt(null);
          mutation.mutate({ current_password: currentPassword, email: email.trim() });
        }}
      >
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={mutation.isPending}
            aria-describedby={helpId}
            required
            className={fieldClass}
          />
        </Field>
        <Field label="Current password">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={mutation.isPending}
            aria-describedby={helpId}
            autoComplete="current-password"
            required
            className={fieldClass}
          />
        </Field>

        <SaveRow
          serverError={serverError}
          savedAt={savedAt}
          busy={mutation.isPending}
          canSubmit={canSubmit}
          label="Save email"
        />
      </form>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Password
// ─────────────────────────────────────────────────────────────────────

function ChangePasswordCard() {
  const uid = useId();
  const helpId = `${uid}-pw-help`;
  const lengthId = `${uid}-pw-length`;
  const matchId = `${uid}-pw-match`;
  const [currentPassword, setCurrentPassword] = useState("");
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
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (outcome.sessionRestored) {
        setSavedAt(Date.now());
        setSessionLost(false);
        setPendingAuthNotice(null);
        return;
      }
      // Do NOT show the ordinary "Saved" affordance: it would imply the
      // viewer can carry on, and their next authed read will 401.
      setSavedAt(null);
      setSessionLost(true);
      // Park the explanation for a teardown this component will not
      // trigger. The session still holds the REVOKED bearer, so the next
      // authed poll 401s and ends it — the badges query alone polls every
      // 30-60s while visible and refetches on window focus. That path
      // passes `notice: "signed-out"`, which would tell the viewer their
      // session ended and say nothing about the password having changed;
      // someone who then tries their OLD password concludes the change
      // failed. Parked, the accurate notice wins whichever path gets
      // there first.
      setPendingAuthNotice("password-changed");
    },
    onError: (err) => {
      setSavedAt(null);
      setSessionLost(false);
      setServerError(humanizePasswordError(err));
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
      currentPassword !== "" || newPassword !== "" || confirmPassword !== "",
    isSaving: mutation.isPending,
  });

  const matches = newPassword === confirmPassword;
  const longEnough = newPassword.length >= 10;
  const showLengthError = newPassword !== "" && !longEnough;
  const showMatchError = confirmPassword !== "" && !matches;
  const canSubmit =
    currentPassword !== "" &&
    longEnough &&
    matches &&
    !mutation.isPending;

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
      <h3 className="bcc-stencil text-lg text-bcc-text">Change password</h3>
      <p id={helpId} className="bcc-mono mt-1 text-[10px] text-bcc-text-secondary">
        At least 10 characters. Every other signed-in device is signed out;
        this one stays signed in.
      </p>

      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit || submitting.current) return;
          submitting.current = true;
          setServerError(null);
          setSavedAt(null);
          mutation.mutate({
            current_password: currentPassword,
            password: newPassword,
          });
        }}
      >
        <Field label="Current password">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={mutation.isPending}
            aria-describedby={helpId}
            autoComplete="current-password"
            required
            className={fieldClass}
          />
        </Field>
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
          <p id={lengthId} className="bcc-mono text-[10px] text-safety">
            Password must be at least 10 characters.
          </p>
        )}
        {showMatchError && (
          <p id={matchId} className="bcc-mono text-[10px] text-safety">
            Passwords don&apos;t match.
          </p>
        )}

        <SaveRow
          serverError={serverError}
          savedAt={savedAt}
          busy={mutation.isPending}
          canSubmit={canSubmit}
          label="Save password"
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
}: {
  serverError: string | null;
  savedAt: number | null;
  busy: boolean;
  canSubmit: boolean;
  label: string;
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
      />
      <button
        type="submit"
        disabled={!canSubmit}
        className="bcc-stencil bg-ink px-4 py-2 text-cardstock transition disabled:opacity-50"
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
