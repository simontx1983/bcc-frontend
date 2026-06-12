"use client";

/**
 * NextAuth error page — wired via authOptions.pages.error.
 *
 * NextAuth redirects here as `/auth-error?error=<Code>` for any sign-in
 * attempt rejected before a session exists. The most common case is
 * AccessDenied — returned by our `signIn` callback when /auth/oauth
 * rejects the bridge request (e.g. a BCC_OAUTH_BRIDGE_SECRET mismatch, or
 * the bridge being unreachable). Without this page NextAuth falls back to
 * its unbranded default error screen.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/AuthCard";

const DEFAULT_COPY = {
  heading: "Sign-in error",
  subheading: "Something went wrong signing you in. Please try again.",
};

const ERROR_COPY: Record<string, { heading: string; subheading: string }> = {
  AccessDenied: {
    heading: "Access denied",
    subheading: "We couldn't sign you in with that account. Please try again, or use a different sign-in method.",
  },
  OAuthSignin: {
    heading: "Sign-in error",
    subheading: "Something went wrong starting that sign-in. Please try again.",
  },
  OAuthCallback: {
    heading: "Sign-in error",
    subheading: "Something went wrong completing that sign-in. Please try again.",
  },
  OAuthCreateAccount: {
    heading: "Sign-in error",
    subheading: "We couldn't create your account from that sign-in. Please try again.",
  },
  OAuthAccountNotLinked: {
    heading: "Account already exists",
    subheading: "An account already exists with that email. Sign in with your original method first.",
  },
  Configuration: {
    heading: "Server error",
    subheading: "There's a configuration issue on our end. Please try again shortly.",
  },
  Verification: {
    heading: "Link expired",
    subheading: "That sign-in link is no longer valid. Please request a new one.",
  },
  SessionRequired: {
    heading: "Sign in required",
    subheading: "Please sign in to continue.",
  },
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("error") ?? "";
  const copy = ERROR_COPY[code] ?? DEFAULT_COPY;

  return (
    <AuthCard heading={copy.heading} subheading={copy.subheading}>
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

export default function AuthErrorPage() {
  return (
    <Suspense>
      <AuthErrorContent />
    </Suspense>
  );
}
