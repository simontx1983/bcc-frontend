"use client";

/**
 * Forgot password page.
 *
 * Submits the email to /wp-json/bcc/v1/auth/forgot-password.
 * On success, shows a confirmation state — no redirect, user stays
 * on this page with instructions to check their inbox.
 *
 * The backend endpoint is not yet wired — the form submits but the
 * fetch is stubbed with a TODO. Replace with the real API call when
 * Phillip has the endpoint ready.
 */

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";

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
      // TODO: replace with real endpoint when available
      // const res = await fetch(`${process.env.NEXT_PUBLIC_BCC_API_URL}/wp-json/bcc/v1/auth/forgot-password`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ email }),
      // });
      // if (!res.ok) throw new Error("request_failed");

      // Stub — simulate success for now
      await new Promise((r) => setTimeout(r, 800));
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      heading="Reset password"
      subheading={
        sent
          ? undefined
          : "Enter your email and we'll send you a reset link."
      }
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