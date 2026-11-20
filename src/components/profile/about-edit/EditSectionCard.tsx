/**
 * EditSectionCard — one Edit About section: the About page's own card
 * shell (AboutCard — same `.bcc-panel`, same mono kicker, same "· N"),
 * with the SHOW ON PROFILE pill in the header's top-right corner
 * (Figma dev note 40). Pass `toggle={null}` for a card with no switch.
 */

import type { ReactNode } from "react";

import { AboutCard } from "@/components/profile/about/AboutCard";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";

export interface EditSectionToggle {
  value: boolean;
  /** Disables the pill — prefs not loaded yet, or a save in flight. */
  pending: boolean;
  onChange: (next: boolean) => void;
  /** Overrides the default "Show on profile: {label}" accessible name. */
  ariaLabel?: string;
}

export function EditSectionCard({
  label,
  count,
  toggle,
  testId,
  children,
}: {
  label: string;
  count?: number | undefined;
  toggle: EditSectionToggle | null;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <AboutCard
      label={label}
      count={count}
      testId={testId}
      aside={
        toggle === null ? undefined : (
          <ToggleSwitch
            variant="pill"
            label="Show on profile"
            ariaLabel={toggle.ariaLabel ?? `Show on profile: ${label}`}
            value={toggle.value}
            pending={toggle.pending}
            onChange={toggle.onChange}
          />
        )
      }
    >
      {children}
    </AboutCard>
  );
}
