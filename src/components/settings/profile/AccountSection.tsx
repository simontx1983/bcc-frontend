"use client";

/**
 * AccountSection — the Account sub-tab on /settings/profile.
 *
 * Three sub-cards, each requiring the user's current password:
 *   1. Change email
 *   2. Change password
 *   3. Delete account (gated by PeepSo's site_registration_allowdelete
 *      option — the server returns 403 when disabled, and we surface
 *      that as a polite "contact admin" message)
 *
 * Handle changes still live on /settings/identity (different surface,
 * different auth flow) — we link there from the top.
 */

import { useState } from "react";

import {
  useChangeAccountEmail,
  useChangeAccountPassword,
  useDeleteAccount,
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
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? err.message;
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
      <DeleteAccountCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────

function ChangeEmailCard({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useChangeAccountEmail({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
      setCurrentPassword("");
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const dirty = email.trim() !== currentEmail.trim();
  const canSubmit = dirty && email.trim() !== "" && currentPassword !== "" && !mutation.isPending;

  return (
    <section className="bcc-panel p-5">
      <h3 className="bcc-stencil text-lg text-ink">Change email</h3>
      <p className="bcc-mono mt-1 text-[10px] text-ink-soft">
        We'll need your current password to confirm.
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
            autoComplete="current-password"
            required
            className={fieldClass}
          />
        </Field>

        <SaveRow
          serverError={serverError}
          savedAt={savedAt}
          savedMessage="Email updated."
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useChangeAccountPassword({
    onSuccess: () => {
      setSavedAt(Date.now());
      setServerError(null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => {
      setSavedAt(null);
      setServerError(humanizeError(err));
    },
  });

  const matches = newPassword === confirmPassword;
  const longEnough = newPassword.length >= 10;
  const canSubmit =
    currentPassword !== "" &&
    longEnough &&
    matches &&
    !mutation.isPending;

  return (
    <section className="bcc-panel p-5">
      <h3 className="bcc-stencil text-lg text-ink">Change password</h3>
      <p className="bcc-mono mt-1 text-[10px] text-ink-soft">
        At least 10 characters. We'll re-establish your session afterwards.
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
            autoComplete="new-password"
            minLength={10}
            required
            className={fieldClass}
          />
        </Field>

        {newPassword !== "" && !longEnough && (
          <p className="bcc-mono text-[10px] text-safety">
            Password must be at least 10 characters.
          </p>
        )}
        {confirmPassword !== "" && !matches && (
          <p className="bcc-mono text-[10px] text-safety">Passwords don't match.</p>
        )}

        <SaveRow
          serverError={serverError}
          savedAt={savedAt}
          savedMessage="Password updated."
          busy={mutation.isPending}
          canSubmit={canSubmit}
          label="Save password"
        />
      </form>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────────

function DeleteAccountCard() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useDeleteAccount({
    onSuccess: (data) => {
      // Server has already torn down the auth cookie. Hard-navigate.
      window.location.href = data.logout_url || "/";
    },
    onError: (err) => {
      setServerError(humanizeError(err));
    },
  });

  const canSubmit =
    currentPassword !== "" &&
    confirmText === "DELETE" &&
    !mutation.isPending;

  if (!showConfirm) {
    return (
      <section className="bcc-panel p-5">
        <h3 className="bcc-stencil text-lg text-safety">Delete account</h3>
        <p className="bcc-mono mt-1 text-[10px] text-ink-soft">
          Permanent. Most of your data is removed; some references in
          others' inboxes and friend lists may persist.
        </p>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="bcc-mono mt-3 border-2 border-safety/70 px-4 py-2 text-[11px] tracking-[0.16em] text-safety transition hover:bg-safety/10"
        >
          DELETE MY ACCOUNT…
        </button>
      </section>
    );
  }

  return (
    <section className="bcc-panel border-safety/40 p-5">
      <h3 className="bcc-stencil text-lg text-safety">Delete account</h3>
      <p className="bcc-mono mt-1 text-[10px] text-ink-soft">
        This is permanent. To confirm, type <code className="bcc-mono text-ink">DELETE</code> below
        and enter your current password.
      </p>

      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          setServerError(null);
          mutation.mutate({
            current_password: currentPassword,
            confirm: "DELETE",
          });
        }}
      >
        <Field label="Type DELETE to confirm">
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={mutation.isPending}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
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
            autoComplete="current-password"
            required
            className={fieldClass}
          />
        </Field>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="bcc-mono min-h-[1rem] text-[10px]">
            {serverError !== null && (
              <span role="alert" className="text-safety">{serverError}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowConfirm(false);
                setCurrentPassword("");
                setConfirmText("");
                setServerError(null);
              }}
              disabled={mutation.isPending}
              className="bcc-mono px-3 py-2 text-[11px] tracking-[0.14em] text-ink-soft hover:text-ink"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="bcc-stencil bg-safety px-4 py-2 text-cardstock transition disabled:opacity-50"
            >
              {mutation.isPending ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared UI bits
// ─────────────────────────────────────────────────────────────────────

const fieldClass =
  "w-full border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint disabled:opacity-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="bcc-mono text-[10px] tracking-[0.16em] text-ink-soft">
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

function SaveRow({
  serverError,
  savedAt,
  savedMessage,
  busy,
  canSubmit,
  label,
}: {
  serverError: string | null;
  savedAt: number | null;
  savedMessage: string;
  busy: boolean;
  canSubmit: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <div className="bcc-mono min-h-[1rem] text-[10px]">
        {serverError !== null && (
          <span role="alert" className="text-safety">{serverError}</span>
        )}
        {savedAt !== null && serverError === null && (
          <span role="status" style={{ color: "var(--verified)" }}>
            {savedMessage}
          </span>
        )}
      </div>
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
