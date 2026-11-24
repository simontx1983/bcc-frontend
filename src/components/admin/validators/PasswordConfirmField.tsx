/**
 * PasswordConfirmField — "CURRENT PASSWORD", for a write that asks the
 * member to prove it's them: the validator admin step-up, and the team
 * screens' administrator invite / removal, re-confirm and permissions
 * save.
 *
 * `autocomplete="current-password"` so a password manager offers the
 * saved one. The value lives in the caller's state, which drops it on
 * success, failure and close; this field holds nothing of its own.
 */

import type { Ref } from "react";

import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/validators/form-classes";

export interface PasswordConfirmFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  /** The caller's error line, when there is one. */
  describedBy?: string | undefined;
  ref?: Ref<HTMLInputElement>;
}

export function PasswordConfirmField({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
  ref,
}: PasswordConfirmFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={ADMIN_LABEL_CLASS}>
        CURRENT PASSWORD
      </label>
      <input
        ref={ref}
        id={id}
        type="password"
        autoComplete="current-password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={ADMIN_INPUT_CLASS}
      />
    </div>
  );
}
