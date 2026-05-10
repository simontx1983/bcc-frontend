"use client";

/**
 * Signup page — email + password + handle → /auth/signup → NextAuth session.
 *
 * Two-step handshake on success:
 *   1. POST /auth/signup creates the WP user, writes bcc_handle meta,
 *      and returns a JWT (the canonical token).
 *   2. signIn("credentials", { email, password }) hits NextAuth's
 *      authorize() callback, which calls /auth/login with the same
 *      credentials and stores the response in the session JWT.
 *
 * Two roundtrips is wasteful but acceptable for V1 — it keeps the
 * NextAuth session as the single source of truth for "logged in"
 * without inventing a custom provider that accepts a pre-issued
 * token. Optimize later if signup becomes a bottleneck (it won't).
 *
 * Handle validation: client-side regex matches §B6 rules so we can
 * give instant feedback. The server is the authoritative validator —
 * it'll re-check and reject anything we missed (or that races into
 * unavailability between this check and the POST).
 */

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { WalletAuthButton } from "@/components/auth/WalletAuthButton";
import { signup } from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";
import { checkHandleLocal, formatHandleHint } from "@/lib/auth/handleValidation";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request:   "Email, password, and handle are all required.",
  bcc_invalid_handle:    "Handle must be 3–20 chars, lowercase letters, digits, or hyphens, with no leading, trailing, or consecutive hyphens.",
  bcc_handle_reserved:   "That handle is reserved.",
  bcc_conflict:          "That handle or email is already taken.",
  bcc_rate_limited:      "Too many signups from this network. Wait a minute.",
  bcc_internal_error:    "Server error. Try again.",
  // Catch-all for unrecognized error.code values from the server.
  bcc_unknown:           "Sign-up failed. Try again, or contact support if the issue persists.",
};

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Live client-side handle validation. The neutral state (empty input)
  // shows the static format hint; any failure mode shows a specific
  // error message and disables submit. Server is still authoritative —
  // it catches "already taken" on submit via `bcc_conflict`.
  const handleErrorKind = checkHandleLocal(handle);
  const handleValid = handleErrorKind === null;
  const handleHint = formatHandleHint(handle, handleErrorKind);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const trimmedDisplayName = displayName.trim();
      await signup({
        email: email.trim(),
        password,
        handle: handle.trim().toLowerCase(),
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

    // Account created → establish NextAuth session via the standard
    // login path. /auth/login is now valid for this account; we just
    // hand the same credentials back through.
    const result = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });

    setSubmitting(false);

    if (result?.error !== undefined && result.error !== null) {
      // Should never happen — we just created this account. Surface
      // generically and route the user to /login so they can retry.
      setError("Account created, but auto-sign-in failed. Try logging in.");
      router.replace("/login");
      return;
    }

    router.replace("/onboarding");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="bcc-panel w-full max-w-md p-6 sm:p-8">
        <h1 className="bcc-stencil text-3xl text-ink">Get on the floor</h1>
        <p className="mt-2 font-serif text-ink-soft">
          Pick a handle. It&apos;s how everyone will see you.
        </p>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="mt-6 flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="bcc-mono text-ink-soft">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="bcc-mono text-ink-soft">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint"
            />
            <span className="bcc-mono text-ink-soft/70">8+ characters</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="bcc-mono text-ink-soft">Handle</span>
            <div className="flex items-center border border-cardstock-edge bg-cardstock-deep/60 focus-within:border-blueprint focus-within:ring-1 focus-within:ring-blueprint">
              <span className="bcc-mono pl-3 text-ink-soft">@</span>
              <input
                type="text"
                required
                minLength={3}
                maxLength={20}
                autoComplete="username"
                pattern="[a-z0-9\-]{3,20}"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                className="flex-1 bg-transparent px-2 py-2 font-serif text-ink outline-none"
              />
            </div>
            <span
              className={`bcc-mono ${handleValid ? "text-ink-soft/70" : "text-safety"}`}
              role={handleValid ? undefined : "alert"}
              aria-live="polite"
            >
              {handleHint}
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="bcc-mono text-ink-soft">Display name (optional)</span>
            <input
              type="text"
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !handleValid}
            className="bcc-stencil mt-2 bg-ink py-3 text-cardstock transition disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>

          {error !== null && (
            <p role="alert" className="bcc-mono text-center text-safety">
              {error}
            </p>
          )}
        </form>

        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-cardstock-edge/40" />
          <span className="bcc-mono text-ink-soft/70">or</span>
          <span className="h-px flex-1 bg-cardstock-edge/40" />
        </div>

        <div className="mt-4">
          <p className="bcc-mono mb-3 text-ink-soft/70">
            Pick a handle above, then sign up with a wallet instead of a password.
          </p>
          <WalletAuthButton
            mode="signup"
            handle={handle}
            // displayName carries through; email stays optional —
            // server mints a deterministic placeholder if blank.
            {...(displayName.trim() !== "" ? { displayName: displayName } : {})}
            // Mirror the email form's submit gate: handle must be valid
            // before we'll touch the wallet, so a Keplr signature isn't
            // burned on a request the server will reject anyway.
            disabled={!handleValid || submitting}
            onSuccess={() => {
              router.replace("/onboarding");
            }}
          />
        </div>

        <p className="mt-6 font-serif text-sm text-ink-soft">
          Already on the floor?{" "}
          <Link href="/login" className="text-blueprint underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
