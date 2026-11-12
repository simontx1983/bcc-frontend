/**
 * The reason a control is unavailable, as a short visible line under it.
 *
 * User decision F-321 (2026-11-12): a disabled action explains itself in
 * text a touch user can read, not only in a `title` tooltip (no hover on
 * a phone, so the explanation never appeared and a tap did nothing).
 * Give the control `aria-describedby={id}` so assistive tech reads the
 * same line. The copy is the server's unlock hint verbatim where there is
 * one (§A2), or the caller's fixed fallback.
 *
 * `theme` for the app's own surfaces, `paper` for the cardstock ones.
 */

import type { ReactNode } from "react";

export function DisabledReason({
  id,
  surface = "theme",
  children,
}: {
  id: string;
  surface?: "theme" | "paper";
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      className={
        "bcc-mono mt-1.5 max-w-[36ch] text-[11px] leading-snug tracking-[0.06em] " +
        (surface === "paper" ? "text-ink-soft" : "text-bcc-text-secondary")
      }
    >
      {children}
    </p>
  );
}
