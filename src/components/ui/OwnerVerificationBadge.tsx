/**
 * OwnerVerificationBadge — the public label for how a validator page's owner
 * was verified ("Wallet Verified", "Node Key Verified", "Verified by BCC").
 *
 * Server-authoritative copy (pattern-registry: badge copy belongs to the
 * server, as with groups/VerificationBadge): `label` and `description` are
 * rendered verbatim, never shortened to "Verified", and no text is derived
 * from `kind`. The public shape carries no date and no method, and nothing
 * here renders one.
 *
 * Fail closed: a missing, null or blank label renders nothing, so a backend
 * without the field shows today's page.
 *
 * The page header only: a native disclosure, where the label is the
 * summary and opening it shows label + description. No client JS, so it
 * renders inside the server-rendered header. (Search rows don't carry the
 * field: bcc-search doesn't serve it, so they keep today's VerifiedBadge.)
 *
 * Mark, not word: the glyph and border carry the verified green, and the
 * label stays neutral.
 */

import { HIT_AREA_44 } from "@/components/feed/hitArea";

export interface OwnerVerificationView {
  label: string;
  /** "" when the server sent none. */
  description: string;
}

export function readOwnerVerification(value: unknown): OwnerVerificationView | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = record["label"];
  if (typeof label !== "string" || label.trim() === "") return null;
  const description = record["description"];
  return { label, description: typeof description === "string" ? description : "" };
}

export function OwnerVerificationBadge({ verification }: { verification: unknown }) {
  const view = readOwnerVerification(verification);
  if (view === null) return null;

  return (
    <details className="mt-3" data-testid="owner-verification">
      {/* 36px to look at; HIT_AREA_44 makes the tap target 44px. */}
      <summary className={`${HIT_AREA_44} bcc-mono inline-flex min-h-[36px] cursor-pointer list-none items-center gap-1.5 rounded-sm border border-verified/50 px-2.5 text-[11px] uppercase tracking-[0.18em] text-bcc-text hover:border-verified [&::-webkit-details-marker]:hidden`}>
        <span aria-hidden style={{ color: "var(--verified)" }}>
          ✓
        </span>
        {view.label}
      </summary>
      <div className="mt-2 max-w-sm border border-bcc-border bg-bcc-surface p-3">
        <p className="bcc-stencil text-bcc-text">{view.label}</p>
        {view.description.trim() !== "" && (
          <p className="mt-1 font-serif text-bcc-text-secondary">{view.description}</p>
        )}
      </div>
    </details>
  );
}
