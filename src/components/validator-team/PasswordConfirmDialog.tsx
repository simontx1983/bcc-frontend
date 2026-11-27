"use client";

/**
 * PasswordConfirmDialog — "Confirm it's you" for a team write that needs
 * the viewer's own password: removing an administrator (or cancelling
 * their invite), re-confirming a member, and saving the permissions.
 *
 * The password lives only in this component's state, so it goes when the
 * dialog closes (it unmounts). The caller runs its write through
 * `mutateThenReset`, so a failed attempt never keeps it in mutation
 * variables either. A wrong password stays here, says so and empties
 * the field; anything the caller can't fix here closes the dialog.
 *
 * Focus: Dialog focuses its first control on open; this component's
 * effect runs after Dialog's and moves focus to the password field — on
 * open and after an error. Dialog returns focus to the trigger on close.
 * The submit button uses aria-disabled + aria-busy (never `disabled`,
 * which drops focus), and a latch ignores a repeat press inside a frame.
 */

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  ADMIN_FIELD_ERROR_CLASS,
  ADMIN_GHOST_BUTTON_CLASS,
  ADMIN_PRIMARY_BUTTON_CLASS,
} from "@/components/admin/validators/form-classes";
import { PasswordConfirmField } from "@/components/admin/validators/PasswordConfirmField";
import { TEAM_ERROR_COPY } from "@/components/validator-team/team-copy";
import { Dialog } from "@/components/ui/Dialog";

export interface PasswordConfirmDialogProps {
  /** The dialog's accessible name and eyebrow, e.g. "Remove administrator". */
  title: string;
  /** One plain sentence saying what happens. */
  body: string;
  confirmLabel: string;
  pending: boolean;
  /**
   * Run the write with the password. Success is the caller's (it closes
   * this dialog). `fail` keeps the dialog open with `message`, emptying
   * the field when `clearPassword`.
   */
  run: (password: string, fail: (message: string, clearPassword: boolean) => void) => void;
  onClose: () => void;
}

export function PasswordConfirmDialog({
  title,
  body,
  confirmLabel,
  pending,
  run,
  onClose,
}: PasswordConfirmDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const latch = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const passwordId = `${idPrefix}-password`;
  const errorId = `${idPrefix}-error`;

  useEffect(() => {
    passwordRef.current?.focus();
  }, [focusTick]);

  const close = () => {
    if (!pending) onClose();
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (latch.current || pending) return;
    if (password === "") {
      setError(TEAM_ERROR_COPY.passwordRequired);
      setFocusTick((n) => n + 1);
      return;
    }
    latch.current = true;
    setError(null);
    run(password, (message, clearPassword) => {
      latch.current = false;
      if (clearPassword) setPassword("");
      setError(message);
      setFocusTick((n) => n + 1);
    });
  }

  return (
    <Dialog title={title} onClose={close} closeDisabled={pending} panelClassName="max-w-md">
      <p className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-safety">
        {title.toUpperCase()}
      </p>
      <form noValidate onSubmit={submit} className="mt-2 flex flex-col gap-4">
        <h2 className="bcc-stencil text-2xl text-bcc-text">Confirm it&apos;s you</h2>
        <p className="font-serif text-bcc-text-secondary">{body}</p>
        <PasswordConfirmField
          ref={passwordRef}
          id={passwordId}
          value={password}
          onChange={setPassword}
          invalid={error !== null}
          describedBy={error !== null ? errorId : undefined}
        />
        {error !== null && (
          <p id={errorId} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
            {error}
          </p>
        )}
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
            aria-busy={pending}
            className={ADMIN_PRIMARY_BUTTON_CLASS}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
