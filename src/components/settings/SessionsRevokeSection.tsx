"use client";

/**
 * SessionsRevokeSection — Tier D minimal D2. Single destructive
 * affordance: sign out of every device, including this one.
 *
 * Wires `useLogoutEverywhere` (POST /auth/logout-everywhere). The
 * server-side handler audit-logs + emails + bumps the token-version
 * meta BEFORE responding, so the bearer is dead by the time the
 * promise resolves. The hook then triggers NextAuth `signOut` and
 * hard-navigates to `/` — by the time the user lands they're
 * signed out everywhere with email confirmation in their inbox.
 *
 * Inline-confirm idiom mirrors `DeleteAccountCard` at
 * `AccountSection.tsx:252` — collapsed button → expanded confirm —
 * but without the password re-verify gate because sign-out-everywhere
 * is reversible-by-re-login. The destructive blast radius is the
 * user's own sessions; reversal cost is one sign-in form.
 *
 * Anti-pressure-mechanic posture: this is a security utility, not a
 * social signal. Equal-weight copy, no scarcity framing, no badges.
 */

import { useState } from "react";

import { useLogoutEverywhere } from "@/hooks/useAccount";
import { BccApiError } from "@/lib/api/types";

const ERROR_COPY: Record<string, string> = {
  bcc_unauthorized: "Sign in required.",
  bcc_rate_limited: "Cooling off — give it a beat and try again.",
};

function humanizeError(err: BccApiError | Error): string {
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? "Couldn't sign out everywhere. Try again.";
  }
  return "Couldn't sign out everywhere. Try again.";
}

export function SessionsRevokeSection() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useLogoutEverywhere();

  if (!showConfirm) {
    return (
      <section className="bcc-panel p-5">
        <h3 className="bcc-stencil text-lg text-bcc-text">Sign out of all devices</h3>
        <p className="bcc-mono mt-1 text-[10px] tracking-[0.18em] text-bcc-text-secondary">
          IF YOU SUSPECT A STOLEN SESSION
        </p>
        <p className="mt-2 font-serif text-bcc-text-secondary">
          Invalidate every active sign-in on your account. You&rsquo;ll need
          to sign back in on every device, including this one. A confirmation
          email goes to your account address either way.
        </p>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="bcc-mono mt-3 border-2 border-bcc-border/50 px-4 py-2 text-[11px] tracking-[0.16em] text-bcc-text transition hover:bg-ink/10 motion-reduce:transition-none"
        >
          SIGN OUT ALL DEVICES…
        </button>
      </section>
    );
  }

  const isPending = mutation.isPending;

  return (
    <section className="bcc-panel border-ink/40 p-5">
      <h3 className="bcc-stencil text-lg text-bcc-text">Sign out of all devices</h3>
      <p className="mt-2 font-serif text-bcc-text-secondary">
        This signs you out everywhere you&rsquo;re currently logged in,
        including this device. The next request from any of them will be
        rejected. You can sign back in normally.
      </p>

      {serverError !== null && (
        <p
          role="alert"
          className="bcc-mono mt-3 border-l-2 border-safety pl-3 text-[11px] tracking-[0.16em] text-safety"
        >
          {serverError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setServerError(null);
            mutation.mutate(undefined, {
              onError: (err) => {
                setServerError(humanizeError(err));
              },
            });
          }}
          className="bcc-mono border-2 border-safety/70 px-4 py-2 text-[11px] tracking-[0.16em] text-safety transition hover:bg-safety/10 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
        >
          {isPending ? "SIGNING OUT…" : "CONFIRM: SIGN OUT EVERYWHERE"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setShowConfirm(false);
            setServerError(null);
          }}
          className="bcc-mono border border-bcc-border/30 px-4 py-2 text-[11px] tracking-[0.16em] text-bcc-text transition hover:bg-ink/10 disabled:opacity-50 motion-reduce:transition-none"
        >
          CANCEL
        </button>
      </div>
    </section>
  );
}
