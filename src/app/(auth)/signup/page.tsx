/**
 * /signup — server-component guard wrapping the client form.
 *
 * An already-authenticated visitor is redirected straight to the Floor
 * rather than shown a signup form for an account they already have —
 * same pattern as /login's guard.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { SignupPageClient } from "@/app/(auth)/signup/SignupPageClient";
import { authOptions } from "@/lib/auth";

export default async function SignupPage() {
  const session = await getServerSession(authOptions);
  if (session !== null) {
    redirect("/?authNotice=signup");
  }
  return <SignupPageClient />;
}
