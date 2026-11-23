/**
 * Form control classes shared by the validator admin screens (history
 * filters, the link / revoke / cancel forms, the step-up dialog). Theme-
 * aware app surface family; 44px tall controls.
 */

export const ADMIN_INPUT_CLASS =
  "bcc-mono min-h-[44px] w-full bg-bcc-input-bg px-3 py-2 text-sm text-bcc-text placeholder:text-bcc-text-placeholder focus:outline-none ring-1 ring-bcc-input-border focus:ring-2 focus:ring-bcc-accent";

/** Multi-line prose input: serif, like every other textarea in the app. */
export const ADMIN_TEXTAREA_CLASS =
  "min-h-[88px] w-full resize-y bg-bcc-input-bg px-3 py-2 font-serif text-sm text-bcc-text placeholder:text-bcc-text-placeholder focus:outline-none ring-1 ring-bcc-input-border focus:ring-2 focus:ring-bcc-accent";

export const ADMIN_LABEL_CLASS = "bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary";

/** Inline field error (doctrine §5.11). */
export const ADMIN_FIELD_ERROR_CLASS = "bcc-mono text-[11px] text-bcc-text-error";

/**
 * Buttons that stay focusable while refused: `aria-disabled` + `aria-busy`
 * instead of `disabled`, which drops keyboard focus to <body> mid-press.
 * The handler ignores the press.
 */
export const ADMIN_PRIMARY_BUTTON_CLASS =
  "bcc-btn bcc-btn-primary min-h-[44px] aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-busy:cursor-wait";

export const ADMIN_OUTLINE_BUTTON_CLASS =
  "bcc-btn bcc-btn-outline min-h-[44px] aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-busy:cursor-wait";

export const ADMIN_GHOST_BUTTON_CLASS =
  "bcc-btn bcc-btn-ghost min-h-[44px] aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
