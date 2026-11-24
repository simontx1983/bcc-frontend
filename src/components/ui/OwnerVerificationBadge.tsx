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
 *   OwnerVerificationBadge — the page header. A native disclosure: the
 *     label is the summary, opening it shows label + description. No
 *     client JS, so it renders inside the server-rendered header.
 *   ClaimVerificationMark — search rows. The row is itself a link or a
 *     listbox option, so no nested control: a static chip with the label,
 *     and today's VerifiedBadge when the field is absent.
 *
 * Mark, not word: the glyph and border carry the verified green, the label
 * stays neutral (theme surfaces in both hosts).
 */

import { HIT_AREA_44 } from "@/components/feed/hitArea";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";

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

/** Search rows: the server's label when present, else today's checkmark. */
export function ClaimVerificationMark({
  isClaimVerified,
  ownerVerification,
}: {
  isClaimVerified: boolean;
  ownerVerification: unknown;
}) {
  const view = readOwnerVerification(ownerVerification);
  if (view === null) return isClaimVerified ? <VerifiedBadge /> : null;

  return (
    <span
      className="bcc-mono inline-flex shrink-0 items-center gap-1 rounded-sm border border-verified/50 px-1 py-0.5 text-[9px] uppercase leading-none tracking-[0.18em] text-bcc-text"
      title={view.description.trim() !== "" ? view.description : undefined}
      data-testid="owner-verification-chip"
    >
      <span aria-hidden style={{ color: "var(--verified)" }}>
        ✓
      </span>
      {view.label}
    </span>
  );
}
