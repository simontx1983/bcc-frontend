/**
 * formatRelativeUTC / formatAbsoluteUTC — case-file timestamp helpers.
 * The relative version is intentionally duplicated from PanelQueue/
 * MyDisputesList per the comment in MyDisputesList.tsx — exporting from
 * the other file would couple two surfaces that don't otherwise depend
 * on each other. Same UTC-stable semantics so SSR matches client.
 *
 * Extracted from DisputeDetail.tsx (Phase 3.3 god-component split) so
 * the CaseHeader / CaseBody siblings can share them without importing
 * each other; logic unchanged.
 */

export function formatRelativeUTC(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "JUST NOW";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}M AGO`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}H AGO`;
  if (diffSec < 86_400 * 30) return `${Math.floor(diffSec / 86_400)}D AGO`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(t))
    .toUpperCase();
}

export function formatAbsoluteUTC(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  })
    .format(new Date(t))
    .toUpperCase()
    .concat(" UTC");
}
