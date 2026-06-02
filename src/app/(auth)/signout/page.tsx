"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";

export default function SignoutPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut({ callbackUrl: "/" });
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
