/**
 * /forgot-password — server-component guard wrapping the client form.
 *
 * An already-authenticated visitor is redirected straight to the Floor —
 * resetting a password from a page reachable while signed out doesn't
 * belong to a session that already has one; same pattern as /login's
 * guard.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ForgotPasswordPageClient } from "@/app/(auth)/forgot-password/ForgotPasswordPageClient";
import { authOptions } from "@/lib/auth";

export default async function ForgotPasswordPage() {
  const session = await getServerSession(authOptions);
  if (session !== null) {
    redirect("/?authNotice=forgot-password");
  }
  return <ForgotPasswordPageClient />;
}
