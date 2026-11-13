"use client";

/**
 * SecureAccountStep — "Secure your account" (F-332). Fully skippable.
 *
 * Shown by the wizard ONLY when GET /wallets says the account has no
 * recovery email (`recovery.has_recovery_email === false`) — i.e. a
 * wallet-only member whose wallet is the one way back in. The wizard owns
 * that decision; this component just renders the step.
 *
 * Two shapes:
 *
 *  1. A code is already on its way. /login's wallet-signup modal took an
 *     optional email, the server mailed a 6-digit code to it at signup,
 *     and the modal left the address in sessionStorage
 *     (lib/onboarding/pending-recovery-email). We verify that code via
 *     POST /auth/verify-email — no wallet signature needed.
 *
 *  2. No pending email. Render the SAME wallet-signed recovery-email form
 *     settings uses (components/settings/RecoveryEmail) rather than a
 *     second copy of the signing flow — gated on the server's
 *     `recovery.available_at` / `available_reason` when those are present.
 *
 * "Skip for now" is always available and writes nothing. Continue unlocks
 * once the server (or a verified code) confirms a recovery email.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import {
  RECOVERY_EMAIL_SESSION_LOST,
  SessionWriteFailedNotice,
} from "@/components/auth/SessionWriteFailedNotice";
import { LandingReveal } from "@/components/landing/LandingReveal";
import { RecoveryEmailForm } from "@/components/settings/RecoveryEmail";
import { useViewerScope } from "@/hooks/useViewerScope";
import { MY_WALLETS_QUERY_KEY, useMyWallets } from "@/hooks/useWallets";
import { resendVerification, verifyEmail } from "@/lib/api/auth-endpoints";
import { humanizeCode, isCode } from "@/lib/api/errors";
import type { LinkedWallet, VerifyEmailResponse } from "@/lib/api/types";
import { currentViewerEpoch, isStaleEpoch } from "@/lib/auth/session-boundary";
import { updateSessionBearer } from "@/lib/auth/session-update";
import { formatAbsoluteDateTime } from "@/lib/format";
import {
  clearPendingRecoveryEmail,
  readPendingRecoveryEmail,
} from "@/lib/onboarding/pending-recovery-email";
import {
  recoveryAvailability,
  type RecoveryAvailability,
} from "@/lib/onboarding/recovery-availability";

const RESEND_COOLDOWN_SECONDS = 60;

/** Buttons and inputs on this step meet the 44px primary-action target. */
const TAP_TARGET = { minHeight: "44px" } as const;

function humanizeVerifyError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_invalid_otp: "That code didn't match or has expired. Check the email or resend.",
      bcc_rate_limited: "Too many tries. Wait a moment, then try again.",
    },
    "Couldn't verify the code. Try again.",
  );
}

function humanizeResendError(err: unknown): string {
  return humanizeCode(
    err,
    { bcc_rate_limited: "Too many tries. Wait a moment, then try again." },
    "Couldn't send a new code. Try again.",
  );
}

export function SecureAccountStep({
  handle,
  onBack,
  onDone,
}: {
  handle: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const wallets = useMyWallets();
  const scope = useViewerScope();

  // `undefined` = not read yet. sessionStorage is read after mount, never
  // during render, so the server-rendered HTML and the first client render
  // agree (the step can be the entry screen via a ?step=secure deep link).
  // Read under the viewer's own scope (F-332 review M2): an email another
  // member's signup left behind is never shown, or resent to. Re-read on a
  // scope change; while the scope is unknown, nothing is read.
  const [pendingEmail, setPendingEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setPendingEmail(scope === null ? undefined : readPendingRecoveryEmail(scope));
  }, [scope]);

  const [codeVerified, setCodeVerified] = useState(false);
  // The verify answered with a fresh bearer that could not be stored: the
  // old one retires soon (#662), so the member must be told to sign in
  // again — the same notice RecoveryEmailForm shows.
  const [sessionLost, setSessionLost] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const recovery = wallets.data?.recovery;
  // The server is the authority on "secured": a code verified here, or the
  // settings form's own success (which invalidates /wallets), both land as
  // has_recovery_email === true.
  const secured = codeVerified || recovery?.has_recovery_email === true;

  function finishVerified(sessionWriteFailed: boolean) {
    clearPendingRecoveryEmail(scope);
    setCodeVerified(true);
    setSessionLost(sessionWriteFailed);
    void queryClient.invalidateQueries({ queryKey: MY_WALLETS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["user"] });
  }

  function useDifferentEmail() {
    clearPendingRecoveryEmail(scope);
    setPendingEmail(null);
  }

  // Skipping drops the hand-off: the member chose not to use it now, and
  // the address should not sit in storage for the rest of the tab.
  function skip() {
    clearPendingRecoveryEmail(scope);
    onDone();
  }

  const verifiedWallets = wallets.data?.items.filter((w) => w.verified) ?? [];

  return (
    <section className="bcc-onb-step">
      <LandingReveal as="p" className="bcc-onb-eyebrow">
        Account recovery
      </LandingReveal>
      <LandingReveal>
        <h1 className="bcc-onb-disp">Secure your account</h1>
        <p className="bcc-onb-note">You&rsquo;re @{handle}</p>
        <p className="bcc-onb-lede">
          Your wallet is how you sign in. Add a recovery email so you can get back
          in if you ever lose access to it.
        </p>
      </LandingReveal>

      <div className="bcc-onb-panel" style={{ marginTop: "clamp(24px, 4vw, 40px)" }}>
        {secured ? (
          <>
          <p role="status" className="bcc-onb-note" style={{ marginTop: 0, color: "var(--verified)" }}>
            Recovery email confirmed. You can continue.
          </p>
          {sessionLost && <SessionWriteFailedNotice message={RECOVERY_EMAIL_SESSION_LOST} />}
          </>
        ) : pendingEmail === undefined ? null : pendingEmail !== null ? (
          <PendingCodeForm
            email={pendingEmail}
            onVerified={finishVerified}
            onUseDifferentEmail={useDifferentEmail}
          />
        ) : wallets.isPending ? (
          <p className="bcc-onb-note" style={{ marginTop: 0 }}>Checking your account…</p>
        ) : (
          <AddRecoveryEmail
            // Evaluated at render with the current clock (F-332 review H2),
            // never a clock captured at mount.
            availability={recoveryAvailability(recovery, Date.now())}
            formOpen={formOpen}
            onOpenForm={() => setFormOpen(true)}
            onCloseForm={() => setFormOpen(false)}
            verifiedWallets={verifiedWallets}
          />
        )}
      </div>

      <footer className="bcc-onb-foot">
        <button type="button" className="bcc-onb-link" onClick={onBack}>
          ← Back
        </button>
        <div className="bcc-onb-foot-end">
          <button type="button" className="bcc-onb-link" onClick={skip}>
            Skip for now
          </button>
          <button
            type="button"
            className="bcc-onb-btn bcc-onb-btn-primary"
            disabled={!secured}
            onClick={onDone}
          >
            Continue
          </button>
        </div>
      </footer>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Case 1 — the code mailed at signup
// ─────────────────────────────────────────────────────────────────────

function PendingCodeForm({
  email,
  onVerified,
  onUseDifferentEmail,
}: {
  email: string;
  /** `true` when the verify's fresh bearer could not be stored. */
  onVerified: (sessionWriteFailed: boolean) => void;
  onUseDifferentEmail: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // Synchronous double-activation guard; `isPending` is state and lags a
  // fast second tap by a render.
  const resendInFlight = useRef(false);

  // F-332 review H1. verify-email looks the account up BY EMAIL and answers
  // with THAT account's bearer. If the session changed while the request
  // was out (a sign-out and someone else's sign-in in another tab), writing
  // that bearer would put one member's token into another's session. The
  // token is adopted only when it names the member signed in NOW and the
  // session boundary has not moved since Verify was pressed. A ref, so the
  // async handler reads the latest session, not the render it started in.
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? null;
  const sessionUserIdRef = useRef<string | null>(sessionUserId);
  useEffect(() => {
    sessionUserIdRef.current = sessionUserId;
  }, [sessionUserId]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = useMutation<
    VerifyEmailResponse,
    Error,
    { code: string; epochAtDispatch: number }
  >({
    mutationFn: ({ code: value }) => verifyEmail({ email, code: value }),
    onSuccess: async (resp, { epochAtDispatch }) => {
      setError(null);
      // The verify call can hand back a fresh bearer. Store it only for the
      // member it names (see the ref above); otherwise DROP it: no session
      // write and no "session lost" notice, because this is not that
      // member's session. The email is verified server-side either way, and
      // a failed write must never fail the step.
      const currentId = sessionUserIdRef.current;
      const sameViewer =
        currentId !== null &&
        String(resp.user_id) === currentId &&
        !isStaleEpoch(epochAtDispatch);
      let sessionWriteFailed = false;
      if (sameViewer && typeof resp.token === "string" && resp.token !== "") {
        sessionWriteFailed = !(await updateSessionBearer({
          token: resp.token,
          expiresIn: resp.expires_in,
        }));
      }
      onVerified(sessionWriteFailed);
    },
    onError: (err) => {
      // Verified already (another tab, or a double submit) is the outcome
      // the member wanted.
      if (isCode(err, "bcc_already_verified")) {
        setError(null);
        onVerified(false);
        return;
      }
      setError(humanizeVerifyError(err));
    },
  });

  const resend = useMutation<void, Error, void>({
    mutationFn: () => resendVerification(email),
    onSuccess: () => {
      setCode("");
      setResendNotice("A new code is on its way.");
      // Cooldown only on a real send — a failure must not lock retry out.
      setCooldown(RESEND_COOLDOWN_SECONDS);
    },
    onError: (err) => setError(humanizeResendError(err)),
    onSettled: () => {
      resendInFlight.current = false;
    },
  });

  function submit() {
    setResendNotice(null);
    if (code.length !== 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setError(null);
    verify.mutate({ code, epochAtDispatch: currentViewerEpoch() });
  }

  function handleResend() {
    if (cooldown > 0 || resend.isPending || resendInFlight.current) return;
    resendInFlight.current = true;
    setError(null);
    setResendNotice(null);
    resend.mutate();
  }

  const busy = verify.isPending;
  const resendLabel = resend.isPending
    ? "Sending…"
    : cooldown > 0
      ? `Resend in ${String(cooldown)}s`
      : "Resend code";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "14px" }}
    >
      <p className="bcc-onb-lede" style={{ marginTop: 0, fontSize: "1rem" }}>
        We sent a 6-digit code to <b>{email}</b>.
      </p>

      <div>
        <label className="bcc-onb-field-label" htmlFor="onb-recovery-code">
          Verification code
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <input
            id="onb-recovery-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            disabled={busy}
            style={TAP_TARGET}
            className="bcc-mono w-[10rem] rounded-sm border border-bcc-input-border bg-bcc-input-bg px-3 tracking-[0.3em] text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50"
          />
          <button type="submit" className="bcc-onb-mini-btn" style={TAP_TARGET} disabled={busy}>
            {busy ? "Verifying…" : "Verify"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <button
          type="button"
          className="bcc-onb-mini-btn"
          style={TAP_TARGET}
          onClick={handleResend}
          disabled={busy || resend.isPending || cooldown > 0}
        >
          {resendLabel}
        </button>
        <button
          type="button"
          className="bcc-onb-mini-btn"
          style={TAP_TARGET}
          onClick={onUseDifferentEmail}
          disabled={busy}
        >
          Use a different email
        </button>
      </div>

      {resendNotice !== null && (
        <p role="status" className="bcc-onb-note" style={{ marginTop: 0 }}>
          {resendNotice}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="bcc-onb-err">
          {error}
        </p>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Case 2 — no pending email: the settings recovery-email form
// ─────────────────────────────────────────────────────────────────────

function AddRecoveryEmail({
  availability,
  formOpen,
  onOpenForm,
  onCloseForm,
  verifiedWallets,
}: {
  availability: RecoveryAvailability;
  formOpen: boolean;
  onOpenForm: () => void;
  onCloseForm: () => void;
  verifiedWallets: LinkedWallet[];
}) {
  // An open form stays open (F-332 review H2): a /wallets refetch that now
  // reads "not open" must not unmount what the member is in the middle of.
  // Only closing it, or the parent seeing has_recovery_email turn true,
  // removes it.
  if (formOpen) {
    return <RecoveryEmailForm verifiedWallets={verifiedWallets} onClose={onCloseForm} />;
  }
  // Availability is the server's call (bcc-trust #658); the mapping lives
  // in lib/onboarding/recovery-availability.
  if (availability.kind === "later") {
    return (
      <p className="bcc-onb-lede" style={{ marginTop: 0, fontSize: "1rem" }}>
        You can add a recovery email from {formatAbsoluteDateTime(availability.at)}.
        You&rsquo;ll find it in Settings → Account.
      </p>
    );
  }
  if (availability.kind === "relogin") {
    return (
      <p className="bcc-onb-lede" style={{ marginTop: 0, fontSize: "1rem" }}>
        Adding a recovery email needs a recently signed-in wallet. Sign out and
        back in with your wallet, then add it in Settings → Account.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
      <p className="bcc-onb-lede" style={{ marginTop: 0, fontSize: "1rem" }}>
        You&rsquo;ll sign a message with your wallet, then enter a 6-digit code
        we email you.
      </p>
      <button type="button" className="bcc-onb-mini-btn" style={TAP_TARGET} onClick={onOpenForm}>
        Add a recovery email
      </button>
    </div>
  );
}
