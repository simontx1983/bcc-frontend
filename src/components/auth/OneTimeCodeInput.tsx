"use client";

/**
 * OneTimeCodeInput — the emailed-code field: digits only, capped at
 * `length`, `autocomplete="one-time-code"` and the numeric keypad.
 *
 * Shared by the 2FA sign-in page and the validator admin step-up dialog.
 * Presentation stays with the caller (`className` / `style`), so each
 * surface keeps its own look; only the input mechanics live here.
 */

import type { CSSProperties, Ref } from "react";

export interface OneTimeCodeInputProps {
  id: string;
  value: string;
  /** Receives the digits only, already capped at `length`. */
  onChange: (digits: string) => void;
  /** Defaults to 6. */
  length?: number;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function OneTimeCodeInput({
  id,
  value,
  onChange,
  length = 6,
  className,
  style,
  placeholder,
  autoFocus,
  disabled,
  required,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ref,
}: OneTimeCodeInputProps) {
  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode="numeric"
      maxLength={length}
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value}
      onChange={(e) => {
        onChange(e.target.value.replace(/\D/g, "").slice(0, length));
      }}
      disabled={disabled}
      required={required}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={className}
      style={style}
    />
  );
}
