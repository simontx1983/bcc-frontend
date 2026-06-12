/**
 * CommunitySignalsStrip — front-face signal row for community cards.
 *
 * Occupies the same chassis slot as OnchainSignalsStrip does on
 * validator cards (thin row, border-t, rail-dot + 9px mono, ellipsize,
 * hides entirely when empty). Content is ` · `-joined in priority
 * order:
 *
 *   1. Gate label — how you get in:
 *        trust_min !== null → "TRUST {n}+"
 *        privacy closed     → "PRIVATE"
 *        privacy secret     → "INVITE-ONLY"
 *        open               → omitted (nothing to warn about)
 *      Rendered text-safety with a safety rail-dot when present.
 *   2. Verification — `verification.label` verbatim (§4.7.1 — never
 *      abbreviated client-side), ◆-prefixed, text-blueprint via the
 *      shared VerificationBadge.
 *
 * The dossier carries no activity/heat block on the wire today
 * (confirmed live 2026-06-11), so the heat segment is omitted — add it
 * here if the backend ever extends CardCommunityDossier.
 *
 * Pure render over the server view-model (§A2) — no client-side
 * eligibility derivation; the JOIN cell's real adjudication happens
 * server-side when the mutation fires.
 */

import { VerificationBadge } from "@/components/groups/VerificationBadge";
import type { CardCommunityDossier } from "@/lib/api/types";

export function CommunitySignalsStrip({
  dossier,
}: {
  dossier: CardCommunityDossier;
}) {
  const gateLabel =
    dossier.trust_min !== null
      ? `TRUST ${dossier.trust_min}+`
      : dossier.privacy === "closed"
      ? "PRIVATE"
      : dossier.privacy === "secret"
      ? "INVITE-ONLY"
      : null;

  const hasVerification = dossier.verification !== null;

  if (gateLabel === null && !hasVerification) {
    return null;
  }

  return (
    <div
      className="relative z-10 flex items-center gap-2 overflow-hidden border-t border-cardstock-edge/40 px-3 py-1.5"
      style={{ background: "rgba(15,13,9,0.03)" }}
    >
      <span
        aria-hidden
        className="bcc-rail-dot"
        style={
          gateLabel !== null
            ? { background: "var(--safety, #ff6b35)" }
            : { background: "var(--blueprint, #0f1e3c)" }
        }
      />
      <span className="bcc-mono flex items-baseline gap-0 whitespace-nowrap overflow-hidden text-ellipsis text-[9px] tracking-[0.18em]">
        {gateLabel !== null && <span className="text-safety">{gateLabel}</span>}
        {gateLabel !== null && hasVerification && (
          <span className="text-ink-soft">&nbsp;·&nbsp;</span>
        )}
        {dossier.verification !== null && (
          <VerificationBadge label={dossier.verification.label} />
        )}
      </span>
    </div>
  );
}
