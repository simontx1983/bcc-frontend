"use client";

/**
 * Login page — email + password → NextAuth credentials sign-in.
 *
 * Error surfacing: `signIn("credentials", { redirect: false })` returns
 * `{ error?: string }`. When `lib/auth.ts` throws an Error with a
 * `bcc_*` code, that code lands in `error` verbatim. We map known
 * codes to user-facing copy here; unknown codes (or NextAuth's own
 * "CredentialsSignin" fallback) get the generic message.
 *
 * Redirect: on success, replace() to either the `callbackUrl` query
 * param (for "return to where you came from" flows) or /onboarding
 * for first-time logins.
 */

import type { Route } from "next";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AuthCard, AuthDivider, SSOButton } from "@/components/auth/AuthCard";
import { WalletAuthButton } from "@/components/auth/WalletAuthButton";
import { WalletSignupPrompt } from "@/components/auth/WalletSignupPrompt";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_credentials: "Invalid email or password.",
  bcc_invalid_request:     "Email and password are required.",
  bcc_rate_limited:        "Too many login attempts. Try again in a minute.",
  bcc_invalid_state:       "This account is missing a handle. Contact support.",
  bcc_network_error:       "Couldn't reach the server. Check your connection.",
  bcc_invalid_envelope:    "Server returned an unexpected response. Try again.",
  bcc_unknown:             "Sign-in failed. Try again, or contact support if the issue persists.",
  CredentialsSignin:       "Invalid email or password.",
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [walletSignupOpen, setWalletSignupOpen] = useState(false);

  function targetAfterLogin(): Route {
    return callbackUrl !== null && callbackUrl !== ""
      ? (callbackUrl as Route)
      : "/onboarding";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setSubmitting(false);

    if (result?.error !== undefined && result.error !== null) {
      setError(ERROR_COPY[result.error] ?? "Sign-in failed. Try again.");
      return;
    }

    router.replace(targetAfterLogin());
  }

  return (
    <>
      <AuthCard
        heading="Welcome back"
        subheading="Sign in to your account to continue."
        footer={
          <>
            New to BCC?{" "}
            <Link href="/signup">Create an account</Link>
          </>
        }
      >
        {/* SSO */}
        <SSOButton provider="google" mode="login" />
        <SSOButton provider="twitter" mode="login" />

        <AuthDivider />

        {/* Email + password form */}
        <form
          onSubmit={(e) => { void handleSubmit(e); }}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <div className="bcc-auth-field">
            <label className="bcc-auth-label" htmlFor="email">Email</label>
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

          <div className="bcc-auth-field">
            <label className="bcc-auth-label" htmlFor="password">Password</label>
            <div className="bcc-auth-input-wrap">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="········"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bcc-auth-input bcc-auth-input--has-icon"
              />
              <button
                type="button"
                className="bcc-auth-input-icon"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            <div className="bcc-auth-forgot">
              <Link href="/forgot-password">Forgot password?</Link>
            </div>
          </div>

          {error !== null && (
            <p role="alert" className="bcc-auth-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="bcc-auth-submit"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <AuthDivider />

        {/* Wallet */}
        <WalletAuthButton
          mode="login"
          onSuccess={() => { router.replace(targetAfterLogin()); }}
          onWalletNotLinked={() => { setWalletSignupOpen(true); }}
        />
      </AuthCard>

      {walletSignupOpen && (
        <WalletSignupPrompt
          onSuccess={() => {
            setWalletSignupOpen(false);
            router.replace(targetAfterLogin());
          }}
          onDismiss={() => { setWalletSignupOpen(false); }}
        />
      )}
    </>
  );
}