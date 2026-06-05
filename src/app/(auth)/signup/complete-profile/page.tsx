"use client";

/**
 * OAuth complete-profile page — /signup/complete-profile
 *
 * Entry point: NextAuth's signIn callback redirects here after an OAuth
 * sign-in where no matching BCC account was found, appending ?pt=<token>.
 *
 * Flow:
 *   1. User picks a handle (and optionally edits their display name).
 *   2. POST /auth/oauth-complete (provider_token + handle) → JWT.
 *   3. signIn("bcc-verified", JWT fields) → NextAuth session.
 *   4. router.replace("/onboarding").
 *
 * The provider_token is short-lived (15 min). On expiry, show an error
 * with a link back to /login so they can restart the OAuth flow.
 *
 * Validation errors (handle taken / invalid) leave the provider_token
 * intact on the backend so the user can correct and retry in place.
 */

import type { Route } from "next";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { oauthComplete } from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";
import { checkHandleLocal, formatHandleHint } from "@/lib/auth/handleValidation";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_oauth_token: "Your sign-in session expired. Please start again.",
  bcc_invalid_handle:      "Handle must be 3–20 chars, lowercase letters, digits, or hyphens.",
  bcc_handle_reserved:     "That handle is reserved. Pick another.",
  bcc_conflict:            "That handle is already taken. Try a different one.",
  bcc_rate_limited:        "Too many attempts. Wait a moment.",
  bcc_unknown:             "Something went wrong. Please try again.",
};

function CompleteProfileContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const pt           = searchParams.get("pt") ?? "";

  const [handle, setHandle]               = useState("");
  const [displayName, setDisplayName]     = useState("");
  const [error, setError]                 = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [signingIn, setSigningIn]         = useState(false);
  const [tokenExpired, setTokenExpired]   = useState(pt === "");

  const handleErrorKind = checkHandleLocal(handle);
  const handleValid     = handleErrorKind === null && handle.length >= 3;
  const handleHint      = formatHandleHint(handle, handleErrorKind);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!handleValid || pt === "") return;
    setError(null);
    setSubmitting(true);

    try {
      const jwt = await oauthComplete({
        provider_token: pt,
        handle:         handle.trim().toLowerCase(),
        ...(displayName.trim() !== "" ? { display_name: displayName.trim() } : {}),
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

  if (tokenExpired) {
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
          disabled={submitting || signingIn || !handleValid}
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
