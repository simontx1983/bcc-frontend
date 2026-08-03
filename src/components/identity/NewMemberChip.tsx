/**
 * NewMemberChip — the explicit New Member account-state label (Rank
 * redesign Phase 5, C8).
 *
 * NOT a rank: a New Member holds no rung on the earned ladder, so this
 * chip is deliberately visually distinct from RankChip — squared
 * corners and a dashed border instead of the rounded rank pill, no
 * trust dot (the chip makes no tier claim), muted text. It reads as a
 * status stamp, not an identity credential.
 *
 * Render rule (enforced at call sites, restated here because it is the
 * whole point): render this ONLY when the payload says
 * `member_state === "new_member"`. When `member_state` is absent (old
 * backend, partial hydration, failure) render NOTHING — absence is
 * "no information", never "new member".
 *
 * Server component-safe: no state, no effects, no browser APIs. Theme
 * aware via --bcc-* tokens.
 */

type NewMemberChipSize = "default" | "compact" | "micro";

const SIZE_STYLES: Record<NewMemberChipSize, { pad: string; font: string }> = {
  default: { pad: "px-2.5 py-[3px]", font: "text-[11px]" },
  compact: { pad: "px-2 py-[2px]", font: "text-[10px]" },
  micro: { pad: "px-1.5 py-0", font: "text-[9px]" },
};

export function NewMemberChip({
  size = "default",
  className,
}: {
  size?: NewMemberChipSize;
  className?: string;
}) {
  const sizeStyles = SIZE_STYLES[size];

  return (
    <span
      className={[
        "bcc-mono inline-flex items-center rounded-[3px] border border-dashed border-[var(--bcc-border)] bg-[var(--bcc-surface-active)] tracking-[0.18em] text-[var(--bcc-text-secondary)]",
        sizeStyles.pad,
        sizeStyles.font,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      title="New member — getting started on the floor. Ranks are earned."
    >
      NEW MEMBER
    </span>
  );
}
