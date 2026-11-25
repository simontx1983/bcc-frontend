"use client";

/**
 * Email verification page — /verify-email
 *
 * Two entry points:
 *
 *   1. After signup (or a sign-in refused as unverified) → no params. The
 *      address arrives in sessionStorage, never the URL (F-410,
 *      lib/auth/pending-verification-email). OTP form shown.
 *   2. Email link click → ?token=yyy (auto-verifies on mount). The token
 *      alone verifies; no address is needed.
 *
 * The address is needed only to verify a code and to resend one. When this
 * tab has none (a new tab, blocked storage, a link opened elsewhere), the
 * OTP form asks for it.
 *
 * LEGACY: earlier redirects carried ?email=, and the emailed link still
 * carries ?email=&token= until the backend drops it (then for the link's
 * 24h life). A legacy ?email= is taken once into sessionStorage and
 * scrubbed from the address bar.
 *
 * On successful verification (either path): the returned JWT is bridged
 * directly into NextAuth via the "bcc-verified" provider, signing the
 * user in automatically and redirecting to /onboarding. The manual
 * "Sign in now" button is shown only as a fallback if that signIn call
 * fails (e.g. network error).
 *
 * Resend: rate-limited to 3/hour on the server. Client-side 60-second
 * cooldown prevents accidental double-taps and shows a countdown.
 */

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { WalletOwnershipPrompt } from "@/components/auth/WalletOwnershipPrompt";
import { RECOVERY_EMAIL_SETTINGS_HREF } from "@/components/settings/RecoveryEmailNudge";
import { noteSignupCompleted } from "@/lib/analytics/posthog";
import {
  resendVerification,
  verifyEmail,
} from "@/lib/api/auth-endpoints";
import { BccApiError, type VerifyEmailResponse } from "@/lib/api/types";
import { suspendedCredential } from "@/lib/auth/auth-flags";
import { canModerateCredential } from "@/lib/auth/can-moderate";
import {
  clearPendingVerificationEmail,
  readPendingVerificationEmail,
  stashPendingVerificationEmail,
} from "@/lib/auth/pending-verification-email";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_verify_token: "This link has expired or has already been used.",
  bcc_invalid_otp:          "Incorrect or expired code. Check the email and try again.",
  // F-294 — after five wrong codes the code is spent.
  bcc_otp_exhausted:        "Too many attempts. Request a new code.",
  bcc_invalid_request:     "Something went wrong. Try resending the code.",
  bcc_rate_limited:         "Too many attempts. Wait a moment and try again.",
  bcc_unknown:              "Verification failed. Try resending the code.",
};

/**
 * F-294 (bcc-trust #717): a wallet sign-up's typed email is held pending
 * until verified. If another account took the address first, the verify
 * (code or link) answers `bcc_conflict` 409 and the server DROPS the
 * pending address — so a resend or another code can never work. Keyed on
 * the code alone: `bcc_already_verified` and `bcc_invalid_state` are 409s
 * too and keep their own handling.
 */
const EMAIL_TAKEN_CODE = "bcc_conflict";
const EMAIL_TAKEN_COPY = "That email is already in use. Add a different one in Settings.";

/**
 * F-263 (M30): the address is verified already. Only the CODE path can
 * say so: the server answers `bcc_already_verified` 409 there ("OTP path
 * only" in the contract). That used to be one more error line on the form,
 * with no way to sign in; it is now its own card with Sign in. A 409 too,
 * so keyed on the code alone.
 *
 * The LINK path cannot tell: the token is deleted on first use, so a link
 * opened a second time answers `bcc_invalid_verify_token` like an expired
 * one. Its "Link expired" card therefore offers Sign in beside Resend,
 * since Resend does nothing for an account that is verified already.
 */
const ALREADY_VERIFIED_CODE = "bcc_already_verified";

/**
 * `wallet-check`: signed in, asking "is this wallet yours?" first.
 * `email-taken`: the pending address went to another account (above).
 * `already-verified`: nothing left to verify (above).
 */
type PageState =
  | "otp-form"
  | "auto-verifying"
  | "success"
  | "link-expired"
  | "wallet-check"
  | "email-taken"
  | "already-verified";

/**
 * LEGACY LINKS ONLY — remove once the emailed link carries only the token
 * and its 24h life has passed. Remove `?email=` from the address bar,
 * without a navigation or a new history entry. Other params (a link's
 * token) stay. Next keeps `useSearchParams` in step with
 * `history.replaceState`.
 */
function scrubEmailParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("email")) return;
  url.searchParams.delete("email");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function VerifyEmailContent() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  // Only a legacy redirect or emailed link still carries ?email=.
  const legacyEmail   = searchParams.get("email") ?? "";
  const tokenParam    = searchParams.get("token") ?? "";

  /**
   * The address being verified, from sessionStorage (or a legacy ?email=,
   * moved there and scrubbed from the address bar). "" when this tab has
   * none: the OTP form then asks for it. `undefined` until read — storage
   * is read after mount, never during render.
   */
  const [knownEmail, setKnownEmail] = useState<string | undefined>(undefined);
  /** Typed into the OTP form when the address is not known. */
  const [typedEmail, setTypedEmail] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (legacyEmail !== "") {
      stashPendingVerificationEmail(legacyEmail);
      scrubEmailParam();
    }
    setKnownEmail(legacyEmail !== "" ? legacyEmail : readPendingVerificationEmail());
    // Mount-only: the address is read once; a scrubbed URL must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const askForEmail   = knownEmail === "";
  const email         = askForEmail ? typedEmail.trim() : (knownEmail ?? "");

  const initialState: PageState = tokenParam !== "" ? "auto-verifying" : "otp-form";

  const [pageState, setPageState]       = useState<PageState>(initialState);
  const [code, setCode]                 = useState("");
  const [error, setError]               = useState<string | null>(null);
  const [submitting, setSubmitting]     = useState(false);
  const [signingIn, setSigningIn]       = useState(false);
  const [resending, setResending]       = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  /** Positive confirmation that a resend actually succeeded. Separate from
   *  `error` so a send failure and a wrong-code failure never overwrite
   *  each other's message. */
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  /** Synchronous duplicate-activation guard. `resending` alone is state:
   *  two clicks in the same tick both read the pre-update value and both
   *  fire, because the disabled attribute only lands on the next render. */
  const resendInFlight = useRef(false);

  async function autoSignIn(tokenResp: VerifyEmailResponse) {
    setSigningIn(true);
    try {
      const result = await signIn("bcc-verified", {
        user_id:          String(tokenResp.user_id),
        handle:           tokenResp.handle,
        token:            tokenResp.token,
        expires_in:       String(tokenResp.expires_in),
        in_good_standing: String(tokenResp.in_good_standing),
        ...canModerateCredential(tokenResp),
        ...suspendedCredential(tokenResp),
        redirect:         false,
      });
      if (result?.ok) {
        // Verification is what completes a password signup. Owed to the
        // next allowed pageview: this route's events are dropped. The
        // manual "Sign in now" fallback below is a plain sign-in and
        // does not mark.
        noteSignupCompleted("password");
        // bcc-trust #398: a wallet already linked to this account may
        // not be the viewer's. Ask before onboarding, but only on a
        // positive count: 0 can also mean the server's read failed.
        const linked = tokenResp.linked_wallet_count;
        if (typeof linked === "number" && Number.isFinite(linked) && linked > 0) {
          setSigningIn(false);
          setPageState("wallet-check");
          return;
        }
        router.replace("/onboarding");
        return;
      }
    } catch {
      // fall through to the manual sign-in button
    }
    setSigningIn(false);
  }

  // ── Token path: auto-verify on mount ──────────────────────────
  const autoVerify = useCallback(async () => {
    try {
      const tokenResp = await verifyEmail({ token: tokenParam });
      clearPendingVerificationEmail();
      setSigningIn(true);
      setPageState("success");
      void autoSignIn(tokenResp);
    } catch (err) {
      if (err instanceof BccApiError && err.code === EMAIL_TAKEN_CODE) {
        // The server dropped the address: nothing left to verify.
        clearPendingVerificationEmail();
        setPageState("email-taken");
        return;
      }
      setPageState("link-expired");
      if (err instanceof BccApiError) {
        // §γ — unmapped codes fall back to generic copy, never err.message.
        setError(ERROR_COPY[err.code] ?? "Verification failed. The link may have expired.");
      } else {
        setError("Verification failed. The link may have expired.");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (code.length !== 6 || email === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const tokenResp = await verifyEmail({ email, code });
      clearPendingVerificationEmail();
      setSigningIn(true);
      setPageState("success");
      void autoSignIn(tokenResp);
    } catch (err) {
      if (err instanceof BccApiError && err.code === EMAIL_TAKEN_CODE) {
        clearPendingVerificationEmail();
        setPageState("email-taken");
      } else if (err instanceof BccApiError && err.code === ALREADY_VERIFIED_CODE) {
        clearPendingVerificationEmail();
        setPageState("already-verified");
      } else if (err instanceof BccApiError) {
        // §γ — unmapped codes fall back to generic copy, never err.message.
        setError(ERROR_COPY[err.code] ?? "Verification failed. Try again.");
      } else {
        setError("Verification failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Resend handler ─────────────────────────────────────────────
  //
  // This used to swallow every failure and start the same 60s cooldown as a
  // success, so a network drop or a server rate-limit rendered EXACTLY like
  // a sent email: "Sending…" → "Resend in 60s". The visitor then waited for
  // a message that was never dispatched.
  //
  // The old justification — "anti-enumeration, only throws on network error"
  // — did not hold: the client's own contract says this call throws on
  // network error OR rate-limit (3/hour per IP). Neither is an enumeration
  // concern, and both are things the visitor needs to know.
  //
  // /forgot-password already gets this right; this now matches it. The
  // anti-enumeration property is preserved where it actually lives — the
  // SUCCESS copy still says "if an account exists", so a successful response
  // continues to reveal nothing about whether the address is registered.
  async function handleResend() {
    if (resendCooldown > 0 || resending || email === "" || resendInFlight.current) return;
    // A typed address is checked by the browser (type="email") first.
    if (askForEmail && emailInput.current?.reportValidity() === false) return;
    resendInFlight.current = true;
    setResending(true);
    setError(null);
    setResendNotice(null);
    try {
      await resendVerification(email);
      setCode("");
      setResendNotice("If an account exists for that address, a new code is on its way.");
      // Cooldown only on a real success — a failed attempt must not lock the
      // visitor out of retrying for a minute.
      setResendCooldown(60);
    } catch (err) {
      // §γ — copy keyed on err.code, never err.message.
      const code = err instanceof BccApiError ? err.code : "";
      setError(
        code === "bcc_rate_limited"
          ? "Too many code requests. Wait a few minutes, then try again."
          : code === "bcc_invalid_request"
          // The server refused the address itself (only a typed one can be).
          ? "Enter a valid email address."
          : "Couldn't send a new code just now. Check your connection and try again.",
      );
    } finally {
      resendInFlight.current = false;
      setResending(false);
    }
  }

  // ── Resend button (shared across states) ──────────────────────
  const resendLabel = resending
    ? "Sending…"
    : resendCooldown > 0
    ? `Resend in ${String(resendCooldown)}s`
    : "Resend code";

  // ── Signed in; "is this wallet yours?" before onboarding ───────
  if (pageState === "wallet-check") {
    return <WalletOwnershipPrompt onDone={() => router.replace("/onboarding")} />;
  }

  // ── Success ────────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <AuthCard
        heading="Email verified"
        subheading={
          signingIn
            ? "Signing you in…"
            : "Your account is confirmed. Sign in to get started on the floor."
        }
      >
        {signingIn ? (
          <p className="bcc-auth-hint" style={{ textAlign: "center", padding: "8px 0" }}>
            Just a moment…
          </p>
        ) : (
          <Link
            href="/login"
            className="bcc-auth-submit"
            style={{ textAlign: "center", textDecoration: "none", display: "block" }}
          >
            Sign in now
          </Link>
        )}
      </AuthCard>
    );
  }

  // ── The pending address went to another account ───────────────
  // No resend and no code entry: the server has dropped the address, so
  // both would be dead ends. The account itself is untouched; a wallet
  // sign-up keeps signing in with its wallet.
  if (pageState === "email-taken") {
    return (
      <AuthCard
        heading="Email already in use"
        subheading="Another account has this email now, so it wasn't added to yours."
      >
        <p role="alert" className="bcc-auth-error" style={{ marginBottom: "12px" }}>
          {EMAIL_TAKEN_COPY}
        </p>
        <p className="bcc-auth-hint" style={{ marginBottom: "12px" }}>
          Your account is fine. Sign in with your wallet as usual.
        </p>
        <Link
          href={RECOVERY_EMAIL_SETTINGS_HREF}
          className="bcc-auth-submit"
          style={{ textAlign: "center", textDecoration: "none", display: "block" }}
        >
          Open Settings
        </Link>
      </AuthCard>
    );
  }

  // ── Verified already (e.g. the link opened twice) ─────────────
  // Not an error and not a dead end: no Resend, no code entry, just the
  // way in.
  if (pageState === "already-verified") {
    return (
      <AuthCard
        heading="Already verified"
        subheading="This email is already verified, so there's nothing more to do here."
      >
        <Link
          href="/login"
          className="bcc-auth-submit"
          style={{ textAlign: "center", textDecoration: "none", display: "block" }}
        >
          Sign in
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

        {askForEmail ? (
          // No address in this tab (e.g. a link opened in a new tab): the
          // OTP form asks for it, and resends from there.
          <button
            type="button"
            onClick={() => { setPageState("otp-form"); setError(null); }}
            className="bcc-auth-submit"
          >
            Get a new code
          </button>
        ) : (
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

        {/* F-263 (M30): a used link reads as expired (see
            ALREADY_VERIFIED_CODE), and Resend does nothing for a verified
            account, so the way in is offered here too. */}
        <p className="bcc-auth-hint" style={{ marginTop: "12px", textAlign: "center" }}>
          Already verified this address? <Link href="/login">Sign in</Link>.
        </p>
      </AuthCard>
    );
  }

  // ── Before mount: the address has not been read yet ───────────
  if (knownEmail === undefined) {
    return (
      <AuthCard heading="Check your email" subheading="Getting your code form ready…">
        <p
          role="status"
          className="bcc-auth-hint"
          style={{ textAlign: "center", padding: "8px 0" }}
        >
          Just a moment…
        </p>
      </AuthCard>
    );
  }

  // ── OTP form (default) ─────────────────────────────────────────
  return (
    <AuthCard
      heading="Check your email"
      subheading={
        askForEmail
          ? "Enter the email you signed up with and the 6-digit code we sent. No code? Resend one below."
          : `We sent a 6-digit code to ${knownEmail}. Enter it below to verify your account.`
      }
    >
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        {askForEmail && (
          <div className="bcc-auth-field">
            <label className="bcc-auth-label" htmlFor="verify-email-address">
              Email
            </label>
            <input
              ref={emailInput}
              id="verify-email-address"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={typedEmail}
              onChange={(e) => { setTypedEmail(e.target.value); }}
              className="bcc-auth-input"
            />
          </div>
        )}

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
          disabled={submitting || code.length !== 6 || email === ""}
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
        {/* Only rendered after the server actually accepted the resend. */}
        {resendNotice !== null && (
          <p role="status" className="bcc-auth-hint" style={{ marginTop: "8px" }}>
            {resendNotice}
          </p>
        )}
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
