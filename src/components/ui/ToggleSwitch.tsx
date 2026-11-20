/**
 * ToggleSwitch — the accessible button-as-switch (`role="switch"` +
 * `aria-checked`), lifted from the byte-identical local copies in
 * settings/CommunitiesList and settings/PrivacySettingsForm (the latter
 * still carries its copy; repointing it is a follow-up).
 *
 * Two looks, one behavior:
 *   - `switch` (default) — the 48×28 track-and-knob the settings panels use.
 *   - `pill` — the Edit About "SHOW ON PROFILE" pill (Figma dev note 40):
 *     a 24px, radius-12, 1px-bordered mono pill. On = accent border + accent
 *     tint + "✓"; Off = neutral border + subtle fill + "○". The label stays
 *     in the theme text scale either way — the accent carries the state
 *     through the border, fill and glyph, never as text color (accent text
 *     fails light-mode contrast). The whole button is a ≥44px tap target;
 *     the pill is the visual inside it.
 *
 * `pending` disables the control (no click, no toggle).
 *
 * The pill is a 24px-tall `rounded-full` (= the Figma radius 12).
 */

export interface ToggleSwitchProps {
  /** Accessible name. For `pill`, also the visible text. */
  label: string;
  value: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
  variant?: "switch" | "pill";
  /**
   * Accessible name override. A page with several identical pills needs
   * each named for its section; keep the visible label inside it
   * ("Show on profile: Your bio") so voice control still matches.
   */
  ariaLabel?: string | undefined;
}

export function ToggleSwitch({
  label,
  value,
  pending,
  onChange,
  variant = "switch",
  ariaLabel,
}: ToggleSwitchProps) {
  if (variant === "pill") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={ariaLabel}
        disabled={pending}
        onClick={() => onChange(!value)}
        className="inline-flex min-h-[44px] shrink-0 items-center justify-end disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={
            "bcc-mono inline-flex h-6 items-center rounded-full gap-1.5 whitespace-nowrap border px-2.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors " +
            (value
              ? "border-bcc-accent bg-bcc-accent-subtle text-bcc-text"
              : "border-bcc-border bg-bcc-surface-hover text-bcc-text-secondary")
          }
        >
          <span
            aria-hidden
            className={value ? "text-[var(--bcc-accent-indicator)]" : "text-bcc-text-secondary"}
          >
            {value ? "✓" : "○"}
          </span>
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel ?? label}
      disabled={pending}
      onClick={() => onChange(!value)}
      className={
        "relative inline-flex h-7 w-12 flex-shrink-0 items-center border-2 transition disabled:opacity-60 " +
        (value
          ? "border-bcc-accent-dark bg-bcc-accent-dark"
          : "border-bcc-border bg-bcc-surface-hover")
      }
    >
      <span
        aria-hidden
        className={
          "block h-4 w-4 transition-transform " +
          (value ? "translate-x-6 bg-bcc-text-inverse" : "translate-x-1 bg-bcc-text")
        }
      />
    </button>
  );
}
