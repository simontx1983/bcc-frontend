"use client";

/**
 * Email verification page — /verify-email
 *
 * Two entry points:
 *
 *   1. After signup     → ?email=xxx  (OTP form shown; no token in URL)
 *   2. Email link click → ?email=xxx&token=yyy  (auto-verifies on mount)
 *
 * On successful verification (either path): shows a success state and
 * a "Sign in" button linking to /login. A separate sign-in step is
 * required because the returned JWT is not fed into NextAuth directly.
 *
 * Resend: rate-limited to 3/hour on the server. Client-side 60-second
 * cooldown prevents accidental double-taps and shows a countdown.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import {
  resendVerification,
  verifyEmail,
} from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_verify_token: "This link has expired or has already been used.",
  bcc_invalid_otp:          "Incorrect or expired code. Check the email and try again.",
  bcc_already_verified:     "This email is already verified. Sign in to continue.",
  bcc_invalid_request:      "Something went wrong. Try resending the code.",
  bcc_rate_limited:         "Too many attempts. Wait a moment and try again.",
  bcc_unknown:              "Verification failed. Try resending the code.",
};

type PageState = "otp-form" | "auto-verifying" | "success" | "link-expired";

function VerifyEmailContent() {
  const searchParams  = useSearchParams();
  const email         = searchParams.get("email") ?? "";
  const tokenParam    = searchParams.get("token") ?? "";

  const initialState: PageState = tokenParam !== "" ? "auto-verifying" : "otp-form";

  const [pageState, setPageState]       = useState<PageState>(initialState);
  const [code, setCode]                 = useState("");
  const [error, setError]               = useState<string | null>(null);
  const [submitting, setSubmitting]     = useState(false);
  const [resending, setResending]       = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // ── Token path: auto-verify on mount ──────────────────────────
  const autoVerify = useCallback(async () => {
    try {
      await verifyEmail({ token: tokenParam });
      setPageState("success");
    } catch (err) {
      setPageState("link-expired");
      if (err instanceof BccApiError) {
        setError(ERROR_COPY[err.code] ?? err.message);
      } else {
        setError("Verification failed. The link may have expired.");
      }
    }
  }, [tokenParam]);

  useEffect(() => {
    if (tokenParam !== "") {
      void autoVerify();
    }
  }, [tokenParam, autoVerify]);

  // ── Resend cooldown tick ───────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(
      () => setResendCooldown((n) => n - 1),
      1000
    );
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // ── OTP submit ─────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (code.length !== 6) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyEmail({ email, code });
      setPageState("success");
    } catch (err) {
      if (err instanceof BccApiError) {
        setError(ERROR_COPY[err.code] ?? err.message);
      } else {
        setError("Verification failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Resend handler ─────────────────────────────────────────────
  async function handleResend() {
    if (resendCooldown > 0 || resending || email === "") return;
    setResending(true);
    setError(null);
    try {
      await resendVerification(email);
      setCode("");
      setResendCooldown(60);
    } catch {
      // resendVerification is anti-enumeration — only throws on network error.
      // Silently ignore: the cooldown still fires so the user isn't spammed.
      setResendCooldown(60);
    } finally {
      setResending(false);
    }
  }

  // ── Resend button (shared across states) ──────────────────────
  const resendLabel = resending
    ? "Sending…"
    : resendCooldown > 0
    ? `Resend in ${String(resendCooldown)}s`
    : "Resend code";

  // ── Success ────────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <AuthCard
        heading="Email verified"
        subheading="Your account is confirmed. Sign in to get started on the floor."
      >
        <Link
          href="/login"
          className="bcc-auth-submit"
          style={{ textAlign: "center", textDecoration: "none", display: "block" }}
        >
          Sign in now
        </Link>
      </AuthCard>
    );
  }

  // ── Auto-verifying (link click, waiting) ──────────────────────
  if (pageState === "auto-verifying") {
    return (
      <AuthCard
        heading="Verifying your email…"
        subheading="Just a moment while we confirm your address."
      >
        <p
          className="bcc-auth-hint"
          style={{ textAlign: "center", padding: "8px 0" }}
        >
          Confirming…
        </p>
      </AuthCard>
    );
  }

  // ── Link expired / token error ────────────────────────────────
  if (pageState === "link-expired") {
    return (
      <AuthCard
        heading="Link expired"
        subheading="This verification link has expired or already been used."
      >
        {error !== null && (
          <p role="alert" className="bcc-auth-error" style={{ marginBottom: "12px" }}>
            {error}
          </p>
        )}

        {email !== "" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button
              type="button"
              onClick={() => { void handleResend(); }}
              disabled={resending || resendCooldown > 0}
              className="bcc-auth-submit"
            >
              {resendLabel}
            </button>
            <button
              type="button"
              onClick={() => { setPageState("otp-form"); setError(null); }}
              className="bcc-auth-submit bcc-auth-submit--outline"
            >
              Enter code manually
            </button>
          </div>
        )}
      </AuthCard>
    );
  }

  // ── OTP form (default) ─────────────────────────────────────────
  const displayEmail = email !== "" ? email : "your inbox";

  return (
    <AuthCard
      heading="Check your email"
      subheading={`We sent a 6-digit code to ${displayEmail}. Enter it below to verify your account.`}
    >
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        <div className="bcc-auth-field">
          <label className="bcc-auth-label" htmlFor="otp-code">
            Verification code
          </label>
          <input
            id="otp-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            className="bcc-auth-input"
            style={{
              textAlign:   "center",
              letterSpacing: "0.5em",
              fontSize:    "22px",
              fontFamily:  "var(--font-mono, monospace)",
            }}
          />
          <span className="bcc-auth-hint">
            6-digit code · expires in 15 minutes
          </span>
        </div>

        {error !== null && (
          <p role="alert" className="bcc-auth-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || code.length !== 6}
          className="bcc-auth-submit"
        >
          {submitting ? "Verifying…" : "Verify email"}
        </button>
      </form>

      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <button
          type="button"
          onClick={() => { void handleResend(); }}
          disabled={resending || resendCooldown > 0 || email === ""}
          className="bcc-auth-submit bcc-auth-submit--outline"
          style={{ fontSize: "14px" }}
        >
          {resendLabel}
        </button>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
