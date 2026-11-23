/**
 * The validator page's server-decided ownership state, and the staff
 * lock marker — shared by the Validator Directory rows and the page view.
 *
 * Colour the mark, not the word: the dot carries the state's hue and the
 * label stays neutral.
 */

import { Lock } from "lucide-react";

import { STATE_LABEL, labelFor } from "@/components/admin/validators/labels";
import type { AdminValidatorPageState } from "@/lib/api/types";

const STATE_MARK: Readonly<Record<AdminValidatorPageState, React.CSSProperties>> = {
  unclaimed: { border: "1px solid var(--bcc-border-strong)" },
  wallet_verified: { background: "var(--verified)" },
  staff_verified: { background: "var(--bcc-info)" },
  conflict: { background: "var(--bcc-warning)" },
};

const CHIP_CLASS =
  "bcc-mono inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-bcc-border px-2 py-0.5 text-[10px] tracking-[0.18em]";

export function StatePill({ state }: { state: AdminValidatorPageState }) {
  return (
    <span className={CHIP_CLASS + " text-bcc-text"} data-state={state}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={STATE_MARK[state]} />
      {labelFor(STATE_LABEL, state).toUpperCase()}
    </span>
  );
}

/** Why staff can't act on a locked owner. Shown on the page view and behind the marker. */
export const LOCKED_FOR_STAFF_COPY = "Owned by proof — only the owner can change this.";

/**
 * Whether an owner is locked for staff, FAIL CLOSED: locked unless the
 * server explicitly says `locked_for_staff === false`. A missing or
 * non-boolean flag reads as locked. The frontend never infers the lock
 * from the verification kind or method. No owner → nothing to lock.
 */
export function lockedForStaff(owner: { locked_for_staff?: unknown } | null): boolean {
  return owner !== null && owner.locked_for_staff !== false;
}

/** Shown wherever `lockedForStaff(owner)` is true (fail closed). */
export function LockedMarker() {
  return (
    <span className={CHIP_CLASS + " text-bcc-text-secondary"} title={LOCKED_FOR_STAFF_COPY}>
      <Lock aria-hidden className="h-2.5 w-2.5 shrink-0" />
      LOCKED
      <span className="sr-only"> — {LOCKED_FOR_STAFF_COPY}</span>
    </span>
  );
}
