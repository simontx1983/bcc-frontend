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

import { WalletAuthButton } from "@/components/auth/WalletAuthButton";
import { WalletSignupPrompt } from "@/components/auth/WalletSignupPrompt";

const ERROR_COPY: Record<string, string> = {
  bcc_invalid_credentials: "Invalid email or password.",
  bcc_invalid_request:     "Email and password are required.",
  bcc_rate_limited:        "Too many login attempts. Try again in a minute.",
  bcc_invalid_state:       "This account is missing a handle. Contact support.",
  bcc_network_error:       "Couldn't reach the server. Check your connection.",
  bcc_invalid_envelope:    "Server returned an unexpected response. Try again.",
  // Catch-all for any non-2xx without a recognizable error.code in the
  // body — emitted by lib/auth.ts when the response shape is unfamiliar.
  bcc_unknown:             "Sign-in failed. Try again, or contact support if the issue persists.",
  // NextAuth's own fallback when authorize() returns null instead of throwing.
  CredentialsSignin:       "Invalid email or password.",
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // When wallet sign-in returns bcc_wallet_not_linked, open the inline
  // signup prompt instead of bouncing to /signup. Keeps the user on
  // the same surface and frames the choice as "create account for
  // this wallet?" rather than starting over somewhere else.
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
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="bcc-panel w-full max-w-md p-8">
        <h1 className="bcc-stencil text-3xl text-ink">Sign in</h1>
        <p className="mt-2 font-serif text-ink-soft">Welcome back to The Floor.</p>

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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="bcc-stencil mt-2 bg-ink py-3 text-cardstock transition disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
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
          <WalletAuthButton
            mode="login"
            onSuccess={() => {
              router.replace(targetAfterLogin());
            }}
            onWalletNotLinked={() => {
              // Per Decision B(a): no account exists for this wallet.
              // Earlier this routed to /signup, but that loses the
              // login context and forces a fresh wallet connect cycle.
              // Open the in-page signup prompt instead — the user picks
              // a handle and completes wallet-signup without leaving
              // /login. The first nonce was consumed; the prompt's
              // WalletAuthButton issues fresh ones for both the signup
              // POST and the session-bridging login POST.
              setWalletSignupOpen(true);
            }}
          />
        </div>

        <p className="mt-6 font-serif text-sm text-ink-soft">
          New to BCC?{" "}
          <Link href="/signup" className="text-blueprint underline">
            Create an account
          </Link>
        </p>
      </div>

      {walletSignupOpen && (
        <WalletSignupPrompt
          onSuccess={() => {
            setWalletSignupOpen(false);
            // Same destination as the email-login success path: respect
            // ?callbackUrl when present, fall through to onboarding for
            // brand-new accounts that just got created via the prompt.
            router.replace(targetAfterLogin());
          }}
          onDismiss={() => {
            setWalletSignupOpen(false);
          }}
        />
      )}
    </main>
  );
}
