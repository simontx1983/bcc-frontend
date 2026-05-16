"use client";

/**
 * BioBox — a "bordered box" rendering of an entity's bio (user bio,
 * project bio, validator bio, group description). Shows the first 25
 * words by default; clicking "READ MORE" expands to the full text.
 *
 * Word truncation is mechanical (whitespace split) — no business logic.
 * The full text is always present in the DOM; "read more" toggles
 * a `clamped` state that swaps which slice renders, so screen readers
 * have the full content available regardless of UI state.
 *
 * Bordered with a cardstock-edge frame to mirror the dotted hero box's
 * vocabulary. Solid border (not dotted) by design — the dotted treatment
 * is reserved for the identity/actions container; the bio box is its
 * own peer.
 *
 * Cold-start state: when the bio is empty AND `ownerEditHref` is set
 * (own-profile view), the empty-state swaps from passive "No bio on
 * file yet." copy to an actionable "WRITE ONE →" link pointing at the
 * settings authoring surface. Non-owners keep the passive copy.
 */

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";

interface BioBoxProps {
  /** Plain text bio. Empty string → component renders an empty-state hint. */
  text: string;
  /** Label rendered as the small kicker above the body. Defaults to "BIO". */
  label?: string;
  /** Number of words shown before the "read more" toggle. Defaults to 25. */
  previewWords?: number;
  /** When provided AND the bio is empty, the empty-state renders an
   *  actionable "WRITE ONE →" link to this href instead of the passive
   *  "No bio on file yet" line. Pass on own-profile callers only. */
  ownerEditHref?: Route;
}

export function BioBox({ text, label = "BIO", previewWords = 25, ownerEditHref }: BioBoxProps) {
  const [expanded, setExpanded] = useState(false);

  const { preview, needsToggle } = useMemo(() => {
    const trimmed = text.trim();
    if (trimmed === "") {
      return { preview: "", needsToggle: false };
    }
    const tokens = trimmed.split(/\s+/);
    if (tokens.length <= previewWords) {
      return { preview: trimmed, needsToggle: false };
    }
    return {
      preview: tokens.slice(0, previewWords).join(" ") + "…",
      needsToggle: true,
    };
  }, [text, previewWords]);

  const trimmed = text.trim();
  // Left safety-orange rail-tick when the bio is non-empty — gives the
  // eye a catch-point on the scan down the actions column so BIO
  // doesn't slip past viewers reading top-to-bottom. Drops on the
  // empty state so an empty bio doesn't look like it's claiming
  // content via the rail accent.
  const hasContent = trimmed !== "";
  const wrapperClass = hasContent
    ? "border border-cardstock-edge/60 border-l-4 border-l-safety bg-cardstock-deep/30 p-5"
    : "border border-cardstock-edge/60 bg-cardstock-deep/30 p-5";

  return (
    <aside className={wrapperClass}>
      <p
        className="bcc-mono text-cardstock-deep"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        {label}
      </p>

      {trimmed === "" ? (
        ownerEditHref !== undefined ? (
          <Link
            href={ownerEditHref}
            className="bcc-mono mt-3 inline-flex items-center gap-2 text-safety hover:underline"
            style={{ fontSize: "11px", letterSpacing: "0.18em" }}
          >
            NO BIO ON FILE — WRITE ONE →
          </Link>
        ) : (
          <p className="font-serif italic mt-3 text-cardstock-deep/70">
            No bio on file yet.
          </p>
        )
      ) : (
        <>
          <p
            className="font-serif text-cardstock mt-3"
            style={{ fontSize: "15px", lineHeight: 1.55 }}
          >
            {expanded ? trimmed : preview}
          </p>

          {needsToggle && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="bcc-mono mt-3 text-safety hover:underline"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              aria-expanded={expanded}
            >
              {expanded ? "READ LESS" : "READ MORE"}
            </button>
          )}
        </>
      )}
    </aside>
  );
}
