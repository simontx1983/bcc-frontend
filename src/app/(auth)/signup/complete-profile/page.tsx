"use client";

/**
 * OAuth complete-profile page — /signup/complete-profile
 *
 * Entry point: NextAuth's signIn callback redirects here after an OAuth
 * sign-in where no matching BCC account was found, with
 * ?email=<email>&provider=<p>#pt=<token> (lib/auth.ts completeProfileUrl;
 * email omitted when the provider didn't supply one — currently always the
 * case for Twitter). The token is in the FRAGMENT so no server ever sees it.
 *
 * Flow:
 *   1. User picks a handle (and optionally edits their display name).
 *      If the provider didn't supply an email, also collects one here —
 *      it's required so the account is recoverable and gets a welcome
 *      email.
 *   2. POST /auth/oauth-complete (provider_token + handle [+ email]) → JWT.
 *   3. signIn("bcc-verified", JWT fields) → NextAuth session.
 *   4. router.replace("/onboarding").
 *
 * The provider_token is short-lived (15 min). On expiry, show an error
 * with a link back to /login so they can restart the OAuth flow. It is
 * read once at mount, held in memory and removed from the URL right away,
 * so it never stays in the address bar or browser history. The server
 * render cannot see a fragment, so the page shows a brief "reading" card
 * until mount — never a "Session expired" flash.
 *
 * Validation errors (handle taken / invalid, email taken / invalid) leave
 * the provider_token intact on the backend so the user can correct and
 * retry in place.
 */

import type { Route } from "next";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useRef, useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { noteSignupCompleted, signupMethodForProvider } from "@/lib/analytics/posthog";
import { oauthComplete } from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";
import { checkHandleLocal, formatHandleHint } from "@/lib/auth/handleValidation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_oauth_token: "Your sign-in session expired. Please start again.",
  bcc_invalid_handle:      "Handle must be 3–20 chars, lowercase letters, digits, or hyphens.",
  bcc_handle_reserved:     "That handle is reserved. Pick another.",
  bcc_invalid_email:       "Please enter a valid email address.",
  bcc_conflict:            "That handle or email is already taken. Try a different one.",
  bcc_rate_limited:        "Too many attempts. Wait a moment.",
  // F-294 (bcc-trust #711): another submit with this token is still being
  // processed. Nothing was created and the token is intact; resubmitting
  // the same form is always safe (a retry after success signs in as that
  // account), so the form stays as it is.
  bcc_unavailable:         "We're still finishing your sign-up. Try again in a moment.",
  bcc_unknown:             "Something went wrong. Please try again.",
};

/**
 * Read the provider token from the URL and remove it, without a navigation
 * or a new history entry. Other params stay. Returns "" when there is none.
 *
 * The fragment (`#pt=`) is where lib/auth.ts puts it. A query `?pt=` is
 * still accepted — and scrubbed — for a redirect issued by a deployment
 * from before the fragment (deploy skew); it can be dropped later.
 * Next keeps `useSearchParams` in step with `history.replaceState`, so the
 * page must hold its own copy.
 */
function takeProviderTokenFromUrl(): string {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const token = fragment.get("pt") ?? url.searchParams.get("pt") ?? "";
  if (!fragment.has("pt") && !url.searchParams.has("pt")) return token;
  fragment.delete("pt");
  url.searchParams.delete("pt");
  const hash = fragment.toString();
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${hash === "" ? "" : `#${hash}`}`,
  );
  return token;
}

function CompleteProfileContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  // The provider token is a credential: read it once, at mount, then take
  // it out of the URL so a later visitor to this history entry, or anyone
  // handed the address, cannot replay it. `undefined` until then — the
  // server render cannot see a fragment.
  const [pt, setPt]  = useState<string | undefined>(undefined);
  // Taken exactly once: StrictMode runs effects twice in development, and
  // the second run would find the URL already scrubbed.
  const tokenTaken   = useRef(false);
  useEffect(() => {
    if (tokenTaken.current) return;
    tokenTaken.current = true;
    setPt(takeProviderTokenFromUrl());
  }, []);
  const needsEmail   = (searchParams.get("email") ?? "") === "";
  // `?provider=` is appended by the OAuth callback (lib/auth.ts).
  const signupMethod = signupMethodForProvider(searchParams.get("provider"));

  const [handle, setHandle]               = useState("");
  const [displayName, setDisplayName]     = useState("");
  const [email, setEmail]                 = useState("");
  const [error, setError]                 = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [signingIn, setSigningIn]         = useState(false);
  const [tokenExpired, setTokenExpired]   = useState(false);

  const handleErrorKind = checkHandleLocal(handle);
  const handleValid     = handleErrorKind === null && handle.length >= 3;
  const handleHint      = formatHandleHint(handle, handleErrorKind);
  const emailValid      = !needsEmail || EMAIL_RE.test(email.trim());

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!handleValid || !emailValid || pt === undefined || pt === "") return;
    setError(null);
    setSubmitting(true);

    try {
      const jwt = await oauthComplete({
        provider_token: pt,
        handle:         handle.trim().toLowerCase(),
        ...(displayName.trim() !== "" ? { display_name: displayName.trim() } : {}),
        ...(needsEmail ? { email: email.trim() } : {}),
      });

      setSigningIn(true);
      const result = await signIn("bcc-verified", {
        user_id:          String(jwt.user_id),
        handle:           jwt.handle,
        token:            jwt.token,
        expires_in:       String(jwt.expires_in),
        in_good_standing: String(jwt.in_good_standing),
        redirect:         false,
      });

      if (result?.ok) {
        // The OAuth account now exists. Owed to the next allowed pageview:
        // this route's events are dropped. An existing user's OAuth
        // sign-in never reaches this page, so it never marks.
        if (signupMethod !== null) noteSignupCompleted(signupMethod);
        router.replace("/onboarding" as Route);
        return;
      }

      setSigningIn(false);
      setError("Sign-in failed. Please try again.");
    } catch (err) {
      const code = err instanceof BccApiError ? err.code : "bcc_unknown";
      if (code === "bcc_invalid_oauth_token") {
        setTokenExpired(true);
      }
      setError(ERROR_COPY[code] ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Before mount (and on the server): the token has not been read yet.
  if (pt === undefined) {
    return (
      <AuthCard heading="One last thing" subheading="Getting your sign-up ready…">
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

  if (tokenExpired || pt === "") {
    return (
      <AuthCard
        heading="Session expired"
        subheading="Your sign-in session timed out. Please start the sign-in process again."
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

  if (signingIn) {
    return (
      <AuthCard heading="Setting up your account…" subheading="Just a moment.">
        <p className="bcc-auth-hint" style={{ textAlign: "center", padding: "8px 0" }}>
          Just a moment…
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      heading="One last thing"
      subheading="Choose your BCC handle. This is how everyone will see you on the platform."
      footer={
        <>
          Want to use a different account?{" "}
          <Link href="/login">Back to sign in</Link>
        </>
      }
    >
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        style={{ display: "flex", flexDirection: "column", gap: "12px" }}
      >
        {needsEmail && (
          <div className="bcc-auth-field">
            <label className="bcc-auth-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); }}
              className="bcc-auth-input"
            />
            <span className="bcc-auth-hint">
              X doesn&apos;t share your email with us — we need one so you can
              recover your account and get updates.
            </span>
          </div>
        )}

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
              autoFocus
              placeholder="your-handle"
              value={handle}
              onChange={(e) => { setHandle(e.target.value.toLowerCase()); }}
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
            onChange={(e) => { setDisplayName(e.target.value); }}
            className="bcc-auth-input"
          />
        </div>

        {error !== null && (
          <p role="alert" className="bcc-auth-error">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || signingIn || !handleValid || !emailValid}
          className="bcc-auth-submit"
        >
          {submitting ? "Creating account…" : "Join the floor"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense>
      <CompleteProfileContent />
    </Suspense>
  );
}
