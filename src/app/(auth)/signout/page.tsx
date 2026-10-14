"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { endSession } from "@/lib/auth/session-boundary";

export default function SignoutPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    // Routed through the session boundary so this page clears the query
    // cache, viewer-scoped storage and this device's push subscription
    // like every other sign-out, instead of only dropping the cookie.
    const result = await endSession("user");
    if (!result.signedOut) {
      // Local private state is already cleared (the teardown does that
      // before signing out). Re-enable the button rather than leaving it
      // stuck on "Signing out…".
      setPending(false);
    }
  }

  return (
    <AuthCard
      heading="Sign out"
      subheading="Are you sure you want to sign out of your account?"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <button
          type="button"
          onClick={() => { void handleSignOut(); }}
          disabled={pending}
          className="bcc-auth-submit"
        >
          {pending ? "Signing out…" : "Sign out"}
        </button>
        <button
          type="button"
          onClick={() => { router.push("/"); }}
          disabled={pending}
          className="bcc-auth-submit bcc-auth-submit--outline"
        >
          Cancel
        </button>
      </div>
    </AuthCard>
  );
}
