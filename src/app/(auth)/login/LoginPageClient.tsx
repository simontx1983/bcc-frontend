"use client";

/**
 * Login page — email/handle + password → 2FA challenge → JWT → NextAuth
 * session.
 *
 * The identifier/password form calls /auth/login directly (not via
 * NextAuth's credentials provider). The backend accepts either an email
 * address or a handle on the same field (shape-detected server-side) —
 * one input, no client-side switch. On success the backend always returns
 * a 2FA challenge; we redirect to /login/two-factor which completes the
 * flow and bridges into NextAuth via the "bcc-verified" provider.
 *
 * Wallet login still goes through NextAuth's wallet provider unchanged.
 *
 * Redirect: after full sign-in, replace() to the `callbackUrl` query param
 * (if present) or /onboarding. This URL is threaded through the 2FA page.
 *
 * An already-authenticated visitor never reaches this component — page.tsx
 * (the server wrapper) redirects to / first.
 */

import { Eye, EyeOff } from "lucide-react";
import type { Route } from "next";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState, Suspense } from "react";

import { AuthCard, AuthDivider, SSOButton } from "@/components/auth/AuthCard";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { WalletAuthButton } from "@/components/auth/WalletAuthButton";
import { WalletSignupPrompt } from "@/components/auth/WalletSignupPrompt";
import { loginWithIdentifier } from "@/lib/api/auth-endpoints";
import { BccApiError, type AuthTokenResponse } from "@/lib/api/types";
import { loginCaptchaChallenge, type LoginCaptchaChallenge } from "@/lib/auth/login-captcha";
import { stashPendingVerificationEmail } from "@/lib/auth/pending-verification-email";
import { safeCallbackPath } from "@/lib/auth/safe-callback";
import { writeOnboardingReturnTo } from "@/lib/onboarding/return-to";
import { stashChallengeToken } from "@/lib/auth/two-factor-challenge";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_credentials:  "Invalid email/handle or password.",
  bcc_invalid_request:      "Email/handle and password are required.",
  bcc_rate_limited:         "Too many login attempts. Try again in a minute.",
  bcc_invalid_state:        "This account is missing a handle. Contact support.",
  bcc_unknown:              "Sign-in failed. Try again, or contact support if the issue persists.",
  // Email verification gate — set by /auth/login when _bcc_email_verified = '0'.
  bcc_email_not_verified:   "Please verify your email address before signing in.",
  // A step-up this client can't render (unknown provider, no site key).
  bcc_captcha_required:     "Sign-in needs an extra check we can't show right now. Wait a few minutes, then try again.",
};

/** The captcha step-up (v1.161) — copy keyed on what just happened. */
const CAPTCHA_COPY = {
  needed:  "Complete the check below, then press Sign in again.",
  retry:   "That check expired or didn't go through. Complete it again, then press Sign in.",
  pending: "Complete the check below first.",
} as const;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  // Only ever follow a same-origin internal path — blocks open-redirect phishing.
  const safeCallback = safeCallbackPath(callbackUrl);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [walletSignupOpen, setWalletSignupOpen] = useState(false);
  /** Set to the email address when the server blocks login with bcc_email_not_verified.
   * Only set when `identifier` itself was an email — if the user typed a
   * handle instead, we don't have their address to hand /verify-email, so
   * the shortcut link is omitted (the generic error still shows). The link
   * hands it over in sessionStorage, never the URL
   * (lib/auth/pending-verification-email). */
  const [notVerifiedEmail, setNotVerifiedEmail] = useState<string | null>(null);
  /**
   * The captcha step-up (lib/auth/login-captcha). `captcha` is set once the
   * server answers bcc_captcha_required and stays for the page's life;
   * `captchaToken` is the widget's single-use token, spent by any submit.
   */
  const [captcha, setCaptcha] = useState<LoginCaptchaChallenge | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  function targetAfterLogin(): Route {
    // Returning sign-in lands on the Floor, not /onboarding. The wizard is
    // reached only right after signup (verify-email → complete-profile →
    // /onboarding). Sending returning users to /onboarding made the page's
    // server gate ("already onboarded? → /") flash the wizard before
    // bouncing them home. A same-origin callbackUrl still wins when present.
    return safeCallback ?? "/";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotVerifiedEmail(null);
    if (captcha !== null && captchaToken === null) {
      setError(CAPTCHA_COPY.pending);
      return;
    }
    setSubmitting(true);
    const sentToken = captchaToken;

    try {
      const resp = await loginWithIdentifier(identifier, password, sentToken ?? undefined);

      if ("status" in resp && resp.status === "2fa_required") {
        // The challenge token goes through sessionStorage, never the URL
        // (history, Referer and access logs) — see lib/auth/two-factor-challenge.
        stashChallengeToken(resp.challenge_token);
        const params = new URLSearchParams();
        if (safeCallback !== null) {
          params.set("callbackUrl", safeCallback);
        }
        const qs = params.toString();
        router.replace(`/login/two-factor${qs === "" ? "" : `?${qs}`}` as Route);
        return;
      }

      // Fallback: backend returned a JWT directly (future: 2FA disabled).
      const jwtResp = resp as AuthTokenResponse;
      const result = await signIn("bcc-verified", {
        user_id:          String(jwtResp.user_id),
        handle:           jwtResp.handle,
        token:            jwtResp.token,
        expires_in:       String(jwtResp.expires_in),
        in_good_standing: String(jwtResp.in_good_standing),
        redirect:         false,
      });
      if (result?.ok) {
        router.replace(targetAfterLogin());
      } else {
        setError("Sign-in failed. Try again.");
      }
    } catch (err) {
      // A token is single-use: whatever the answer, it is spent. Reset the
      // widget for a fresh one.
      if (sentToken !== null) {
        setCaptchaToken(null);
        setCaptchaReset((n) => n + 1);
      }
      const challenge = loginCaptchaChallenge(err);
      if (challenge !== null) {
        setCaptcha(challenge);
        setError(sentToken !== null ? CAPTCHA_COPY.retry : CAPTCHA_COPY.needed);
        return;
      }
      // §γ — an unrenderable step-up falls to ERROR_COPY like any code.
      const code = err instanceof BccApiError ? err.code : "bcc_unknown";
      setError(ERROR_COPY[code] ?? "Sign-in failed. Try again.");
      if (code === "bcc_email_not_verified") {
        setNotVerifiedEmail(identifier.includes("@") ? identifier : null);
      }
    } finally {
      setSubmitting(false);
    }
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
        {/* SSO — returning login lands on the Floor; new SSO users still
            reach onboarding via complete-profile's own redirect. */}
        <SSOButton provider="google"  mode="login" callbackUrl={safeCallback ?? "/"} />
        <SSOButton provider="twitter" mode="login" callbackUrl={safeCallback ?? "/"} />

        <AuthDivider />

        {/* Email + password form */}
        <form
          onSubmit={(e) => { void handleSubmit(e); }}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <div className="bcc-auth-field">
            <label className="bcc-auth-label" htmlFor="identifier">Email or handle</label>
            <input
              id="identifier"
              type="text"
              required
              autoComplete="username"
              placeholder="you@example.com or handle"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
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
                  <EyeOff size={16} strokeWidth={2} aria-hidden />
                ) : (
                  <Eye size={16} strokeWidth={2} aria-hidden />
                )}
              </button>
            </div>
            <div className="bcc-auth-forgot">
              <Link href="/forgot-password">Forgot password?</Link>
            </div>
          </div>

          {/* The captcha step-up: mounted only after the server asks. */}
          {captcha !== null && (
            <div className="bcc-auth-field" role="group" aria-label="Verification check">
              <TurnstileWidget
                siteKey={captcha.siteKey}
                resetSignal={captchaReset}
                onToken={(token) => {
                  setCaptchaToken(token);
                  setError((current) => (current === CAPTCHA_COPY.pending ? null : current));
                }}
                onExpire={() => setCaptchaToken(null)}
                onFail={() => setCaptchaToken(null)}
              />
            </div>
          )}

          {error !== null && (
            <p role="alert" className="bcc-auth-error">{error}</p>
          )}

          {notVerifiedEmail !== null && (
            <p className="bcc-auth-hint">
              <Link
                href="/verify-email"
                onClick={() => { stashPendingVerificationEmail(notVerifiedEmail); }}
              >
                Verify your email →
              </Link>
            </p>
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
          onSuccess={(scope) => {
            setWalletSignupOpen(false);
            // F-332: a brand-new wallet account goes through onboarding,
            // same as /signup's wallet path — not to the Floor or the
            // callbackUrl. The wizard's "Secure your account" step is
            // where a wallet-only member adds a recovery email.
            // A new account goes through onboarding (F-332), and the deep
            // link it came from is kept for when onboarding finishes.
            // Keyed to the new account (the modal read its session).
            writeOnboardingReturnTo(safeCallback, scope);
            router.replace("/onboarding");
          }}
          onDismiss={() => { setWalletSignupOpen(false); }}
        />
      )}
    </>
  );
}

export function LoginPageClient() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
