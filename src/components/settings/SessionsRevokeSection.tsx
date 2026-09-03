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
 * Confirmation is the shared `ConfirmDialog`. The inline expand-in-place
 * confirm it replaces had three gaps the dialog closes for free: focus
 * never moved into the confirmation, so a keyboard user was left on a
 * button that had just been re-rendered; there was no focus trap or
 * Escape; and the only double-submit guard was `mutation.isPending`,
 * which lags a render — the same hole that was measured firing `mutate`
 * twice during the PR #160 hardening pass.
 *
 * Still NO password gate, deliberately: sign-out-everywhere is
 * reversible by signing in again. The destructive blast radius is the
 * user's own sessions; reversal cost is one sign-in form. The frontend
 * also cannot reauthenticate anyone, and pretending otherwise with a
 * password field would be theatre.
 *
 * Anti-pressure-mechanic posture: this is a security utility, not a
 * social signal. Equal-weight copy, no scarcity framing, no badges.
 */

import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLogoutEverywhere } from "@/hooks/useAccount";
import { BccApiError } from "@/lib/api/types";

const ERROR_COPY: Record<string, string> = {
  bcc_unauthorized: "Sign in required.",
  bcc_rate_limited: "Cooling off — give it a beat and try again.",
};

function humanizeError(err: BccApiError | Error): string {
  // §γ — keyed on err.code; never the server's raw err.message.
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? "Couldn't sign out everywhere. Try again.";
  }
  return "Couldn't sign out everywhere. Try again.";
}

export function SessionsRevokeSection() {
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [restoreFocus, setRestoreFocus] = useState(false);

  const mutation = useLogoutEverywhere();

  // Cancel and Escape both land here; the trigger is still mounted, so
  // focus goes back exactly where it came from.
  useEffect(() => {
    if (!restoreFocus) return;
    triggerRef.current?.focus();
    setRestoreFocus(false);
  }, [restoreFocus]);

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
        ref={triggerRef}
        onClick={() => {
          setServerError(null);
          setConfirming(true);
        }}
        className="bcc-mono mt-3 border-2 border-bcc-border/50 px-4 py-2 text-[11px] tracking-[0.16em] text-bcc-text transition hover:bg-bcc-surface-hover motion-reduce:transition-none"
      >
        Sign out everywhere…
      </button>

      {confirming && (
        <ConfirmDialog
          title="Sign out everywhere?"
          body="This signs you out on every device, including this one. You can sign back in normally."
          confirmLabel="Sign out everywhere"
          cancelLabel="Stay signed in"
          retryLabel="Try again"
          errorMessage={serverError}
          pending={mutation.isPending}
          onConfirm={() => {
            setServerError(null);
            mutation.mutate(undefined, {
              // Success is not handled here on purpose: the hook already
              // signs out and navigates away, so there is no surviving
              // component to update.
              onError: (err) => setServerError(humanizeError(err)),
            });
          }}
          onCancel={() => {
            setConfirming(false);
            setServerError(null);
            setRestoreFocus(true);
          }}
        />
      )}
    </section>
  );
}
