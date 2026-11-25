"use client";

/**
 * StepUpDialog — the owner-level confirmation every validator admin V1
 * write passes: the admin's password, then a code emailed to their
 * account address. Shared by link, revoke and cancel.
 *
 *   Step 1 "Confirm it's you": POST step-up {action, target_user_id,
 *          current_password}. The password is checked there, so a wrong
 *          one sends no email.
 *   Step 2 "Enter the code": "Resend code" waits out `resend_after`;
 *          "Confirm" runs the caller's write with {step_up_id, code}.
 *
 * The address the code went to is never shown (the server never sends
 * it). The password and code live only in this component's state: they
 * go when the dialog closes (it unmounts), the start mutation is reset
 * as soon as it succeeds, and the step-up / write mutations are dropped
 * from the cache with `gcTime: 0` (useAdminValidators).
 *
 * Errors are keyed on `code` + `data.reason` (§γ), never the server's
 * message — see `stepUpErrorOutcome`. A 409 or a vanished link closes
 * the dialog (the caller shows why and the reads refresh); a 422 on a
 * field the caller owns goes back to the caller's form.
 *
 * Focus: Dialog focuses its first control on open; this component's
 * effect runs after Dialog's, so it moves focus to the step's first
 * field — on open, on a step change, and after an error clears a field.
 * Dialog returns focus to the trigger on close. Submit buttons use
 * aria-disabled + aria-busy (never `disabled`, which drops focus), and a
 * latch ignores a repeat press inside one frame.
 */

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  ADMIN_FIELD_ERROR_CLASS,
  ADMIN_GHOST_BUTTON_CLASS,
  ADMIN_INPUT_CLASS,
  ADMIN_LABEL_CLASS,
  ADMIN_OUTLINE_BUTTON_CLASS,
  ADMIN_PRIMARY_BUTTON_CLASS,
} from "@/components/admin/validators/form-classes";
import { OneTimeCodeInput } from "@/components/auth/OneTimeCodeInput";
import { Dialog } from "@/components/ui/Dialog";
import { useResendValidatorStepUp, useStartValidatorStepUp } from "@/hooks/useAdminValidators";
import {
  conflictReason,
  invalidField,
  invalidReason,
  isAdminDenial,
  isAdminIdNotFound,
  isOwnershipConflict,
  stepUpFailureReason,
} from "@/lib/api/admin-errors";
import { isCode, isServiceUnavailable } from "@/lib/api/errors";
import { BccApiError } from "@/lib/api/types";
import type { ValidatorStepUpAction, ValidatorStepUpProof } from "@/lib/api/types";

export const STEP_UP_COPY = {
  passwordHeading: "Confirm it's you",
  passwordIntro: "Enter your password. We'll then email a code to your account address.",
  codeHeading: "Enter the code",
  emailed: "We emailed a code to your account address.",
  wrongPassword: "That password isn't right.",
  wrongCode: "That code isn't right.",
  expired: "That code has expired. Start again.",
  mismatch: "This confirmation was for a different action. Start again.",
  restart: "This confirmation can't be used any more. Start again.",
  rateLimited: "Too many attempts. Wait a moment and try again.",
  unavailable: "The server couldn't finish this just now, and nothing was changed. Try again.",
  denied: "Changing validator ownership is restricted to platform admins.",
  signIn: "Your session has ended. Sign in again, then try again.",
  passwordRequired: "Enter your current password.",
  codeRequired: "Enter the code from the email.",
  rejected: "The server didn't accept this. Check it and try again.",
  targetNotEligible: "This member can't be made an owner. Pick someone else.",
  vanished: "That page or owner link no longer exists. The latest details are shown.",
  generic: "Couldn't finish this. Try again.",
  resent: "A new code is on its way.",
  resendFailed: "Couldn't send a new code. Try again.",
} as const;

/** 409 `bcc_conflict` copy, keyed on `data.reason`. */
export const CONFLICT_COPY: Readonly<Record<string, string>> = {
  wallet_owner_present: "This page has a proof-verified owner, so staff can't change it.",
  owner_exists: "This page already has an owner. Revoke them first.",
  validator_has_operator: "One of this page's validators already has a verified operator.",
  already_cancelled: "This link was already cancelled.",
  not_cancellable: "This link can no longer be cancelled.",
};

/** A 409 with a reason this build doesn't know. */
export const CONFLICT_FALLBACK_COPY =
  "This page changed while you were working. The latest details are shown.";

/** The code is 6 digits, like the sign-in code. */
const CODE_LENGTH = 6;

export type StepUpErrorOutcome =
  /** Stay on this step; `clear` empties the step's secret field. */
  | { kind: "stay"; message: string; clear: boolean }
  /** Back to step 1 with a fresh step-up. */
  | { kind: "restart"; message: string }
  /** Close the dialog; the caller shows `message` and the reads refresh. */
  | { kind: "close"; message: string }
  /** A 422 naming a field. */
  | { kind: "field"; field: string };

/**
 * Where a failed step-up start, resend or write leaves the dialog, and
 * what it says. Pure, keyed on code + `data.reason` (§γ).
 */
export function stepUpErrorOutcome(
  err: unknown,
  fallback: string = STEP_UP_COPY.generic,
): StepUpErrorOutcome {
  const stay = (message: string, clear = false): StepUpErrorOutcome => ({
    kind: "stay",
    message,
    clear,
  });
  if (isAdminDenial(err)) return stay(STEP_UP_COPY.denied);
  if (isCode(err, "bcc_step_up_failed")) {
    switch (stepUpFailureReason(err)) {
      case "password":
        return stay(STEP_UP_COPY.wrongPassword, true);
      case "code":
        return stay(STEP_UP_COPY.wrongCode, true);
      case "expired":
      case "used":
        return { kind: "restart", message: STEP_UP_COPY.expired };
      case "mismatch":
        return { kind: "restart", message: STEP_UP_COPY.mismatch };
      default:
        return { kind: "restart", message: STEP_UP_COPY.restart };
    }
  }
  if (isCode(err, "bcc_step_up_required")) {
    return { kind: "restart", message: STEP_UP_COPY.restart };
  }
  if (isOwnershipConflict(err)) {
    const reason = conflictReason(err);
    return { kind: "close", message: (reason !== null ? CONFLICT_COPY[reason] : undefined) ?? CONFLICT_FALLBACK_COPY };
  }
  if (isAdminIdNotFound(err)) return { kind: "close", message: STEP_UP_COPY.vanished };
  if (isCode(err, "bcc_invalid_request")) {
    // The member can't hold the role (no account, suspended, or no member
    // powers). One plain line that never says which: it closes the dialog,
    // and the form keeps everything else for a different pick.
    if (invalidReason(err) === "target_not_eligible") {
      return { kind: "close", message: STEP_UP_COPY.targetNotEligible };
    }
    const field = invalidField(err);
    return field !== null ? { kind: "field", field } : stay(STEP_UP_COPY.rejected);
  }
  if (isCode(err, "bcc_rate_limited") || (err instanceof BccApiError && err.status === 429)) {
    return stay(STEP_UP_COPY.rateLimited);
  }
  if (isServiceUnavailable(err)) return stay(STEP_UP_COPY.unavailable);
  if (err instanceof BccApiError && err.status === 401) return stay(STEP_UP_COPY.signIn);
  return stay(fallback);
}

/** The write a confirmed step-up unlocks, supplied by the caller. */
export interface StepUpWrite {
  /** The write's mutation is in flight. */
  isPending: boolean;
  /**
   * Run the write with the proof. Success is the caller's to handle (it
   * closes this dialog); a failure goes to `onError`.
   */
  run: (proof: ValidatorStepUpProof, onError: (err: unknown) => void) => void;
}

export interface StepUpDialogProps {
  pageId: number;
  action: ValidatorStepUpAction;
  /** The user the write acts on: the owner to link, revoke or cancel. */
  targetUserId: number;
  /** The dialog's name and eyebrow, e.g. "Link an owner". */
  title: string;
  write: StepUpWrite;
  /** A 409 or a vanished link: close, show `message`, refresh. */
  onConflict: (message: string) => void;
  /**
   * A 422 on `field`. Return true when the caller's form owns the field
   * (it closes the dialog and shows the error there); false keeps the
   * dialog open with a general line.
   */
  onFieldError: (field: string) => boolean;
  onClose: () => void;
}

interface ActiveStepUp {
  id: string;
  expiresIn: number;
}

export function StepUpDialog({
  pageId,
  action,
  targetUserId,
  title,
  write,
  onConflict,
  onFieldError,
  onClose,
}: StepUpDialogProps) {
  const start = useStartValidatorStepUp(pageId);
  const resend = useResendValidatorStepUp();

  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stepUp, setStepUp] = useState<ActiveStepUp | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  // Same-frame repeat presses: React Query's isPending lags one render.
  const latch = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const idPrefix = useId();
  const passwordId = `${idPrefix}-password`;
  const codeId = `${idPrefix}-code`;
  const errorId = `${idPrefix}-error`;

  const pending = start.isPending || write.isPending;

  useEffect(() => {
    (step === 1 ? passwordRef : codeRef).current?.focus();
  }, [step, focusTick]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const refocus = () => setFocusTick((n) => n + 1);

  const close = () => {
    if (!pending) onClose();
  };

  function restart(message: string) {
    setStepUp(null);
    setPassword("");
    setCode("");
    setResendIn(0);
    setNotice(null);
    setError(message);
    setStep(1);
    refocus();
  }

  function handleError(err: unknown, fallback?: string) {
    latch.current = false;
    const outcome = stepUpErrorOutcome(err, fallback);
    switch (outcome.kind) {
      case "stay":
        if (outcome.clear) {
          if (step === 1) setPassword("");
          else setCode("");
        }
        setError(outcome.message);
        refocus();
        return;
      case "restart":
        restart(outcome.message);
        return;
      case "close":
        onConflict(outcome.message);
        return;
      case "field":
        if (outcome.field === "current_password") {
          setPassword("");
          setError(STEP_UP_COPY.passwordRequired);
          setStep(1);
          refocus();
        } else if (outcome.field === "code") {
          setCode("");
          setError(STEP_UP_COPY.wrongCode);
          refocus();
        } else if (outcome.field === "step_up_id") {
          restart(STEP_UP_COPY.restart);
        } else if (!onFieldError(outcome.field)) {
          setError(STEP_UP_COPY.rejected);
        }
        return;
    }
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (latch.current || pending) return;
    if (password === "") {
      setError(STEP_UP_COPY.passwordRequired);
      refocus();
      return;
    }
    latch.current = true;
    setError(null);
    start.mutate(
      { action, target_user_id: targetUserId, current_password: password },
      {
        onSuccess: (res) => {
          latch.current = false;
          // Drop the password from the mutation's state and this component's.
          start.reset();
          setPassword("");
          setStepUp({ id: res.step_up_id, expiresIn: res.expires_in });
          setResendIn(res.resend_after);
          setCode("");
          setNotice(null);
          setStep(2);
        },
        onError: (err) => handleError(err),
      },
    );
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (latch.current || pending || stepUp === null) return;
    if (code === "") {
      setError(STEP_UP_COPY.codeRequired);
      refocus();
      return;
    }
    latch.current = true;
    setError(null);
    setNotice(null);
    write.run({ step_up_id: stepUp.id, code }, (err) => handleError(err));
  }

  const resendBlocked = resendIn > 0 || resend.isPending || pending || stepUp === null;
  function onResend() {
    if (resendBlocked || stepUp === null) return;
    const id = stepUp.id;
    setError(null);
    setNotice(null);
    resend.mutate(id, {
      onSuccess: (res) => {
        setStepUp({ id, expiresIn: res.expires_in });
        setResendIn(res.resend_after);
        setCode("");
        setNotice(STEP_UP_COPY.resent);
      },
      onError: (err) => handleError(err, STEP_UP_COPY.resendFailed),
    });
  }

  const resendLabel = resend.isPending
    ? "Sending…"
    : resendIn > 0
      ? `Resend code in ${resendIn}s`
      : "Resend code";
  const minutes = stepUp === null ? 0 : Math.max(1, Math.round(stepUp.expiresIn / 60));

  const errorLine =
    error === null ? null : (
      <p id={errorId} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
        {error}
      </p>
    );

  return (
    <Dialog title={title} onClose={close} closeDisabled={pending} panelClassName="max-w-md">
      <p className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-safety">
        {title.toUpperCase()}
      </p>

      {step === 1 ? (
        <form noValidate onSubmit={submitPassword} className="mt-2 flex flex-col gap-4">
          <h2 className="bcc-stencil text-2xl text-bcc-text">{STEP_UP_COPY.passwordHeading}</h2>
          <p className="font-serif text-bcc-text-secondary">{STEP_UP_COPY.passwordIntro}</p>
          <div className="flex flex-col gap-2">
            <label htmlFor={passwordId} className={ADMIN_LABEL_CLASS}>
              CURRENT PASSWORD
            </label>
            <input
              ref={passwordRef}
              id={passwordId}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? errorId : undefined}
              className={ADMIN_INPUT_CLASS}
            />
          </div>
          {errorLine}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={close}
              aria-disabled={pending}
              className={ADMIN_GHOST_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              aria-disabled={pending}
              aria-busy={start.isPending}
              className={ADMIN_PRIMARY_BUTTON_CLASS}
            >
              {start.isPending ? "Checking…" : "Continue"}
            </button>
          </div>
        </form>
      ) : (
        <form noValidate onSubmit={submitCode} className="mt-2 flex flex-col gap-4">
          <h2 className="bcc-stencil text-2xl text-bcc-text">{STEP_UP_COPY.codeHeading}</h2>
          <p className="font-serif text-bcc-text-secondary">
            {STEP_UP_COPY.emailed} It works for {minutes} {minutes === 1 ? "minute" : "minutes"}.
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor={codeId} className={ADMIN_LABEL_CLASS}>
              CODE
            </label>
            <OneTimeCodeInput
              ref={codeRef}
              id={codeId}
              length={CODE_LENGTH}
              placeholder="000000"
              required
              value={code}
              onChange={setCode}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? errorId : undefined}
              className={ADMIN_INPUT_CLASS + " tracking-[0.3em]"}
            />
          </div>
          {errorLine}
          <p role="status" className="bcc-mono min-h-[1rem] text-[11px] text-bcc-text-secondary">
            {notice ?? ""}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onResend}
              aria-disabled={resendBlocked}
              aria-busy={resend.isPending}
              className={ADMIN_OUTLINE_BUTTON_CLASS}
            >
              {resendLabel}
            </button>
            <span className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={close}
                aria-disabled={pending}
                className={ADMIN_GHOST_BUTTON_CLASS}
              >
                Cancel
              </button>
              <button
                type="submit"
                aria-disabled={pending}
                aria-busy={write.isPending}
                className={ADMIN_PRIMARY_BUTTON_CLASS}
              >
                {write.isPending ? "Confirming…" : "Confirm"}
              </button>
            </span>
          </div>
        </form>
      )}
    </Dialog>
  );
}
