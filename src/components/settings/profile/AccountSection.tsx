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

import { useId, useState } from "react";
import { SettingsSaveStatus } from "@/components/settings/SettingsSaveStatus";
import { useDirtyRegistration } from "@/hooks/useDirtyRegistration";

import {
  useChangeAccountEmail,
  useChangeAccountPassword,
} from "@/hooks/useAccount";
import { BccApiError } from "@/lib/api/types";

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

  const mutation = useChangeAccountPassword({
    onSuccess: (outcome) => {
      setServerError(null);
      setCurrentPassword("");
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
    },
    onError: (err) => {
      setSavedAt(null);
      setSessionLost(false);
      setServerError(humanizeError(err));
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
            and read as "the change did not work". A sign-in link is the
            only honest next step. */}
        <a
          href="/login"
          className="bcc-auth-submit mt-4 inline-flex items-center justify-center"
        >
          Sign in again
        </a>
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
          if (!canSubmit) return;
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
