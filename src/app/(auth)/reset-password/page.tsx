"use client";

/**
 * Reset password page.
 *
 * Reads `key` and `login` from the URL — both were emailed to the user
 * via /auth/forgot-password. POSTs to /auth/reset-password with the
 * pair plus the chosen new password. On success, replace()s to
 * /login?reset=1 so the login page can flash a "password reset" banner.
 *
 * Error contract:
 *   - bcc_invalid_reset_token → link expired or already used
 *   - bcc_weak_password       → < 8 chars
 *   - bcc_rate_limited        → 10/hour attempt cap tripped
 *   - missing key/login in URL → "Invalid reset link"
 */

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState, Suspense } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { confirmPasswordReset } from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";

const MIN_PASSWORD_LENGTH = 8;

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_reset_token: "This reset link is expired or invalid. Request a new one.",
  bcc_weak_password:       `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  bcc_rate_limited:        "Too many attempts. Try again later.",
  bcc_invalid_request:     "Missing required fields.",
};

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const key   = searchParams.get("key")   ?? "";
  const login = searchParams.get("login") ?? "";

  const [password, setPassword]   = useState("");
  const [confirm,  setConfirm]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkValid = key !== "" && login !== "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(key, login, password);
      router.replace("/login?reset=1" as Route);
    } catch (err) {
      if (err instanceof BccApiError) {
        setError(ERROR_COPY[err.code] ?? "Something went wrong. Try again.");
      } else {
        setError("Something went wrong. Try again.");
      }
      setSubmitting(false);
    }
  }

  if (!linkValid) {
    return (
      <AuthCard
        heading="Invalid reset link"
        subheading="This link is missing required info — it may have been truncated by your email client."
        footer={<Link href={"/forgot-password" as Route}>Request a new reset link</Link>}
      >
        <p className="bcc-auth-error" role="alert">
          Open the link directly from the email, or request a new one below.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      heading="Set a new password"
      subheading="Pick a strong password you don't use anywhere else."
      footer={<Link href={"/login" as Route}>Back to sign in</Link>}
    >
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        style={{ display: "flex", flexDirection: "column", gap: "12px" }}
      >
        <div className="bcc-auth-field">
          <label className="bcc-auth-label" htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bcc-auth-input"
          />
        </div>

        <div className="bcc-auth-field">
          <label className="bcc-auth-label" htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="bcc-auth-input"
          />
        </div>

        {error !== null && (
          <p role="alert" className="bcc-auth-error">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="bcc-auth-submit"
        >
          {submitting ? "Saving…" : "Set new password"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
