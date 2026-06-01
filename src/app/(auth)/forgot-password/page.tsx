"use client";

/**
 * Forgot password page.
 *
 * Submits the email to /wp-json/bcc/v1/auth/forgot-password. The
 * backend always responds ok=true regardless of whether the email
 * matches an account (anti-enumeration); only real matches actually
 * dispatch a reset email. UI shows the same "check your inbox"
 * confirmation either way.
 *
 * Errors a caller can see:
 *   - bcc_rate_limited → "Too many requests, try again later"
 *   - network failure  → "Something went wrong, try again"
 */

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { requestPasswordReset } from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      if (err instanceof BccApiError && err.code === "bcc_rate_limited") {
        setError("Too many password-reset requests. Try again later.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      heading="Reset password"
      {...(!sent && { subheading: "Enter your email and we'll send you a reset link." })}
      footer={
        <Link href="/login">Back to sign in</Link>
      }
    >
      {sent ? (
        /* ── Success state ── */
        <div className="bcc-auth-success">
          <div className="bcc-auth-success-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="bcc-auth-success-title">Check your inbox</p>
          <p className="bcc-auth-success-body">
            If an account exists for <strong>{email}</strong>, you&apos;ll receive a password reset link shortly.
          </p>
        </div>
      ) : (
        /* ── Form state ── */
        <form
          onSubmit={(e) => { void handleSubmit(e); }}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <div className="bcc-auth-field">
            <label className="bcc-auth-label" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}