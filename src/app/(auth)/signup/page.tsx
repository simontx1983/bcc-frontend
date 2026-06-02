"use client";

/**
 * Signup page — email + password + handle → /auth/signup → /verify-email.
 *
 * On success: POST /auth/signup returns {ok, email}. No JWT is minted —
 * the user must verify their email before they can log in. We redirect
 * them to /verify-email?email=<email> to complete the flow.
 *
 * Handle validation: client-side regex gives instant feedback.
 * Server is authoritative — catches "already taken" via bcc_conflict.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AuthCard, AuthDivider, SSOButton } from "@/components/auth/AuthCard";
import { WalletAuthButton } from "@/components/auth/WalletAuthButton";
import { signup } from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";
import { checkHandleLocal, formatHandleHint } from "@/lib/auth/handleValidation";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request: "Email, password, and handle are all required.",
  bcc_invalid_handle:  "Handle must be 3–20 chars, lowercase letters, digits, or hyphens, with no leading, trailing, or consecutive hyphens.",
  bcc_handle_reserved: "That handle is reserved.",
  bcc_conflict:        "That handle or email is already taken.",
  bcc_rate_limited:    "Too many signups from this network. Wait a minute.",
  bcc_internal_error:  "Server error. Try again.",
  bcc_unknown:         "Sign-up failed. Try again, or contact support if the issue persists.",
};

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [handle, setHandle]           = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);

  const handleErrorKind = checkHandleLocal(handle);
  const handleValid     = handleErrorKind === null;
  const handleHint      = formatHandleHint(handle, handleErrorKind);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const trimmedEmail = email.trim();
    try {
      const trimmedDisplayName = displayName.trim();
      await signup({
        email:   trimmedEmail,
        password,
        handle:  handle.trim().toLowerCase(),
        ...(trimmedDisplayName !== "" ? { display_name: trimmedDisplayName } : {}),
      });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof BccApiError) {
        setError(ERROR_COPY[err.code] ?? err.message);
      } else {
        setError("Sign-up failed. Try again.");
      }
      return;
    }

    setSubmitting(false);
    router.replace(`/verify-email?email=${encodeURIComponent(trimmedEmail)}`);
  }

  return (
    <AuthCard
      heading="Join the floor"
      subheading="Pick a handle. It's how everyone will see you."
      footer={
        <>
          Already on the floor?{" "}
          <Link href="/login">Sign in</Link>
        </>
      }
    >
      {/* SSO — disabled until Phillip wires OAuth */}
      <SSOButton provider="google"  mode="signup" />
      <SSOButton provider="twitter" mode="signup" />

      <AuthDivider />

      {/* Email / password / handle form */}
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
              minLength={8}
              autoComplete="new-password"
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
          <span className="bcc-auth-hint">8+ characters</span>
        </div>

        <div className="bcc-auth-field">
          <label className="bcc-auth-label" htmlFor="handle">Handle</label>
          <div className="bcc-auth-handle-wrap">
            <span className="bcc-auth-handle-prefix">@</span>
            <input
              id="handle"
              type="text"
              required
              minLength={3}
              maxLength={20}
              autoComplete="username"
              placeholder="your-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              className="bcc-auth-input bcc-auth-handle-input"
            />
          </div>
          <span
            className={`bcc-auth-hint ${!handleValid && handle.length > 0 ? "bcc-auth-hint--error" : ""}`}
            role={!handleValid && handle.length > 0 ? "alert" : undefined}
            aria-live="polite"
          >
            {handleHint}
          </span>
        </div>

        <div className="bcc-auth-field">
          <label className="bcc-auth-label" htmlFor="displayName">
            Display name <span className="bcc-auth-label-optional">(optional)</span>
          </label>
          <input
            id="displayName"
            type="text"
            maxLength={60}
            autoComplete="name"
            placeholder="How you want to appear"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="bcc-auth-input"
          />
        </div>

        {error !== null && (
          <p role="alert" className="bcc-auth-error">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !handleValid}
          className="bcc-auth-submit"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      {/* Wallet signup */}
      <AuthDivider />

      <div className="bcc-auth-field">
        <p className="bcc-auth-hint" style={{ marginBottom: "8px" }}>
          Pick a handle above, then sign up with a wallet instead of a password.
        </p>
        <WalletAuthButton
          mode="signup"
          handle={handle}
          {...(displayName.trim() !== "" ? { displayName } : {})}
          disabled={!handleValid || submitting}
          onSuccess={() => { router.replace("/onboarding"); }}
        />
      </div>
    </AuthCard>
  );
}