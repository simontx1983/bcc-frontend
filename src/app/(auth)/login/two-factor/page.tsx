"use client";

/**
 * 2FA verification page — /login/two-factor
 *
 * Entry point: redirected here by the login page after /auth/login
 * returns { status: "2fa_required", challenge_token }. The challenge
 * token and optional callbackUrl are passed as query params.
 *
 * Flow:
 *   1. User enters the 6-digit OTP sent to their email.
 *   2. POST /auth/2fa/verify (challenge_token + code) → JWT.
 *   3. signIn("bcc-verified", JWT fields) → NextAuth session.
 *   4. router.replace(callbackUrl ?? "/"). Returning users only reach this
 *      page, so the default is the Floor; new signups route to /onboarding
 *      via their own flows (verify-email / complete-profile / wallet).
 *
 * Resend: 60-second cooldown. Calls /auth/2fa/resend with the
 * challenge token to send a fresh OTP without restarting login.
 */

import type { Route } from "next";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { resend2faCode, verify2fa } from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";
import { safeCallbackPath } from "@/lib/auth/safe-callback";

const ERROR_COPY: Record<string, string> = {
  // The backend separates these two, so the copy does too. `..._code` means
  // the code was wrong while the challenge is STILL VALID — hedging with
  // "or expired" sent people off to resend a code that was fine, and left
  // them unsure which of two different things had gone wrong. Expiry has
  // its own code below, and its own terminal screen.
  bcc_invalid_2fa_code:  "That code doesn't match. Check your email and try again.",
  bcc_invalid_2fa_token: "This session has expired. Please sign in again.",
  bcc_invalid_request:   "Something went wrong. Please sign in again.",
  bcc_rate_limited:      "Too many attempts. Wait a moment and try again.",
  bcc_unknown:           "Verification failed. Try resending the code.",
};

function TwoFactorContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const ct           = searchParams.get("ct") ?? "";
  const callbackUrl  = searchParams.get("callbackUrl");
  // Only ever follow a same-origin internal path — blocks open-redirect phishing.
  const safeCallback = safeCallbackPath(callbackUrl);

  const [code, setCode]                     = useState("");
  const [error, setError]                   = useState<string | null>(null);
  const [submitting, setSubmitting]         = useState(false);
  const [signingIn, setSigningIn]           = useState(false);
  const [resending, setResending]           = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  /** Positive confirmation that a resend actually succeeded — kept apart
   *  from `error` so a delivery failure and a wrong-code failure never
   *  overwrite one another. */
  const [resendNotice, setResendNotice]     = useState<string | null>(null);
  /** Synchronous duplicate-activation guard — see the note in
   *  /verify-email; `resending` state alone loses a same-tick double tap. */
  const resendInFlight = useRef(false);
  const [sessionExpired, setSessionExpired] = useState(ct === "");

  function targetAfterLogin(): Route {
    // Returning sign-in lands on the Floor, not /onboarding — the 2FA page
    // is only reached by EXISTING users (email/password login always routes
    // through here). New signups reach the wizard via their own explicit
    // redirects (verify-email / complete-profile / wallet-signup), never
    // this default. Defaulting here to /onboarding made the onboarding
    // page's "already onboarded? → /" server gate flash the wizard for a
    // beat before bouncing returning users home. A same-origin callbackUrl
    // still wins when present.
    return safeCallback ?? "/";
  }

  // ── Resend cooldown tick ───────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // ── OTP submit ─────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (code.length !== 6) return;
    setError(null);
    setSubmitting(true);
    try {
      const tokenResp = await verify2fa(ct, code);
      setSigningIn(true);
      const result = await signIn("bcc-verified", {
        user_id:          String(tokenResp.user_id),
        handle:           tokenResp.handle,
        token:            tokenResp.token,
        expires_in:       String(tokenResp.expires_in),
        in_good_standing: String(tokenResp.in_good_standing),
        redirect:         false,
      });
      if (result?.ok) {
        router.replace(targetAfterLogin());
        return;
      }
      setSigningIn(false);
      setError("Sign-in failed. Please try again.");
    } catch (err) {
      const errCode = err instanceof BccApiError ? err.code : "bcc_unknown";
      if (errCode === "bcc_invalid_2fa_token") {
        setSessionExpired(true);
      }
      setError(ERROR_COPY[errCode] ?? "Verification failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Resend handler ─────────────────────────────────────────────
  //
  // Was a silent swallow that started the same 60s cooldown on failure as
  // on success, so a rate-limit (3/min here) or a network drop looked
  // exactly like a delivered code. Same fix as /verify-email: the cooldown
  // is a consequence of a SENT code, never of a failed attempt.
  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || resending || ct === "" || resendInFlight.current) return;
    resendInFlight.current = true;
    setResending(true);
    setError(null);
    setResendNotice(null);
    try {
      await resend2faCode(ct);
      setCode("");
      setResendNotice("A new code is on its way.");
      setResendCooldown(60);
    } catch (err) {
      // §γ — copy keyed on err.code, never err.message.
      const code = err instanceof BccApiError ? err.code : "";
      if (code === "bcc_invalid_2fa_token") {
        // The challenge itself died; resending cannot help. Route to the
        // terminal state that already exists rather than offering a retry
        // that can only fail.
        setSessionExpired(true);
        return;
      }
      setError(
        code === "bcc_rate_limited"
          ? "Too many code requests. Wait a minute, then try again."
          : "Couldn't send a new code just now. Check your connection and try again.",
      );
    } finally {
      resendInFlight.current = false;
      setResending(false);
    }
  }, [ct, resending, resendCooldown]);

  const resendLabel = resending
    ? "Sending…"
    : resendCooldown > 0
    ? `Resend in ${String(resendCooldown)}s`
    : "Resend code";

  // ── Session expired ────────────────────────────────────────────
  if (sessionExpired) {
    return (
      <AuthCard
        heading="Session expired"
        subheading="Your login session timed out. Please sign in again."
      >
        {error !== null && (
          <p role="alert" className="bcc-auth-error" style={{ marginBottom: "12px" }}>
            {error}
          </p>
        )}
        <Link
          href="/login"
          className="bcc-auth-submit"
          style={{ textAlign: "center", textDecoration: "none", display: "block" }}
        >
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  // ── Signing in ─────────────────────────────────────────────────
  if (signingIn) {
    return (
      <AuthCard
        heading="Signing you in…"
        subheading="Just a moment."
      >
        <p className="bcc-auth-hint" style={{ textAlign: "center", padding: "8px 0" }}>
          Just a moment…
        </p>
      </AuthCard>
    );
  }

  // ── OTP form ───────────────────────────────────────────────────
  return (
    <AuthCard
      heading="Check your email"
      subheading="We sent a 6-digit code to your email address. Enter it below to complete sign-in."
    >
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        <div className="bcc-auth-field">
          <label className="bcc-auth-label" htmlFor="2fa-code">
            Verification code
          </label>
          <input
            id="2fa-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            className="bcc-auth-input"
            style={{
              textAlign:     "center",
              letterSpacing: "0.5em",
              fontSize:      "22px",
              fontFamily:    "var(--font-mono, monospace)",
            }}
          />
          <span className="bcc-auth-hint">
            6-digit code · expires in 5 minutes
          </span>
        </div>

        {error !== null && (
          <p role="alert" className="bcc-auth-error">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || signingIn || code.length !== 6}
          className="bcc-auth-submit"
        >
          {submitting ? "Verifying…" : "Confirm sign-in"}
        </button>
      </form>

      <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <button
          type="button"
          onClick={() => { void handleResend(); }}
          disabled={resending || resendCooldown > 0 || ct === ""}
          className="bcc-auth-submit bcc-auth-submit--outline"
          style={{ fontSize: "14px" }}
        >
          {resendLabel}
        </button>
        {/* Only rendered after the server actually accepted the resend. */}
        {resendNotice !== null && (
          <p role="status" className="bcc-auth-hint" style={{ textAlign: "center" }}>
            {resendNotice}
          </p>
        )}
        <p className="bcc-auth-hint" style={{ textAlign: "center" }}>
          Wrong account?{" "}
          <Link href="/login">Sign in with a different account</Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorContent />
    </Suspense>
  );
}
