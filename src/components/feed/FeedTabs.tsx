"use client";

/**
 * FeedTabs — §N6 scope selector (For You / Watching / Signals).
 *
 * V1 keeps the state local (no URL-syncing yet). The plan calls for
 * `?feed=signals` deep-linking; lift to URL state when the home page
 * needs shareable tab routes.
 *
 * Default tab is "for_you" per §N6 — the algorithmic feed that
 * combines watched entities, high-trust entities, and recency. New
 * users with zero watched entities still get a useful feed via §F2
 * fallback inside the server's ranking service.
 *
 * Note: the `following` scope value is part of the API contract
 * (§9 — do not rename). The label is the only thing that changed.
 */

import { FOLLOW_COPY } from "@/lib/copy";
import type { FeedScope } from "@/lib/api/types";

interface FeedTabsProps {
  active: FeedScope;
  onChange: (scope: FeedScope) => void;
}

const TABS: ReadonlyArray<{ scope: FeedScope; label: string }> = [
  { scope: "for_you",   label: "For You" },
  { scope: "following", label: FOLLOW_COPY.state },
  { scope: "signals",   label: "Signals" },
];

export function FeedTabs({ active, onChange }: FeedTabsProps) {
  return (
    <nav role="tablist" aria-label="Feed scope" className="flex items-center gap-1 border-b border-cardstock-edge/30">
      {TABS.map(({ scope, label }) => {
        const isActive = scope === active;
        return (
          <button
            key={scope}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(scope)}
            className={
              isActive
                ? "bcc-stencil border-b-2 border-safety px-4 py-2.5 text-sm text-cardstock"
                : "bcc-stencil border-b-2 border-transparent px-4 py-2.5 text-sm text-cardstock-deep/70 hover:text-cardstock"
            }
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
