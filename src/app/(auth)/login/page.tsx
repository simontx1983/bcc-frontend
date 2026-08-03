/**
 * /login — server-component guard wrapping the client form.
 *
 * An already-authenticated visitor is redirected straight to the Floor
 * rather than shown a sign-in form for a session they already have —
 * same server-side pattern as /onboarding's "already onboarded? → /"
 * gate. Silent redirect, no interstitial (matches GitHub/X, not the
 * "you're already logged in" banner pattern some sites use).
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { LoginPageClient } from "@/app/(auth)/login/LoginPageClient";
import { authOptions } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session !== null) {
    redirect("/?authNotice=login");
  }
  return <LoginPageClient />;
}
