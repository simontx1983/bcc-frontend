/**
 * DetailLayout — the ONE detail-page layout (Site Structure A, design §12;
 * Phillip chose hero option B, the compact identity header, 2026-11-25).
 * Every detail page — community and Hall first (D1), then validator /
 * project / creator (D2) and the member profile (D3) — is:
 *
 *   rail (FileRail, the page's own)
 *   [owner banner — owner/team only, the page's own]
 *   DetailHeader — avatar · kind · name · @handle · chips · actions · stats
 *   tabs + DetailBody — the main column beside a 300px side column; on a
 *                       phone the side blocks follow the main column
 *
 * Only the information differs between pages. The trading card is NOT in
 * the header (option B): it stays on every list, where you meet it first.
 *
 * DetailPage opts out of the app shell's 680px reading cap
 * (`.bcc-page-wide`): a detail page owns its own 1440px width, as the
 * list pages do.
 */

import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import type { CardStat } from "@/lib/api/types";

/** The page-wide frame of a detail page. */
export function DetailPage({ children }: { children: ReactNode }) {
  return <main className="bcc-page-wide pb-24">{children}</main>;
}

/** The 1440px container every detail section sits in. */
export const DETAIL_CONTAINER = "mx-auto w-full max-w-[1440px] px-4 sm:px-7";

/*
 * The header's counts strip, as static class strings so Tailwind generates
 * them. Up to three counts sit in one row at every width (a community's
 * Posts (7d) · Active · Members reads fine at 390px). Four or more go two
 * across below sm: four in one row clipped their labels at 375px ("FOLLOW…",
 * testnet UX audit S2, when the entity page drew them in its StatsStrip).
 */
const STATS_BASE_COLS = ["grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;
const STATS_SM_COLS = [
  "sm:grid-cols-1",
  "sm:grid-cols-2",
  "sm:grid-cols-3",
  "sm:grid-cols-4",
  "sm:grid-cols-5",
  "sm:grid-cols-6",
] as const;

export function headerStatsColumns(count: number): string {
  const n = Math.max(1, Math.min(count, 6));
  const base = n <= 3 ? STATS_BASE_COLS[n - 1] : "grid-cols-2";
  return `${base} ${STATS_SM_COLS[n - 1]}`;
}

/**
 * Below sm, an odd count of four or more (5) would leave an empty cell
 * beside the last count in the two-across grid; the last one spans both
 * columns instead. From sm up it is one row, so no span.
 */
export function headerStatsCellSpan(count: number, index: number): string {
  const n = Math.min(count, 6);
  return n >= 4 && n % 2 === 1 && index === n - 1 ? "col-span-2 sm:col-span-1" : "";
}

export function DetailHeader({
  avatar,
  kind,
  kindColor,
  name,
  handle,
  chips,
  actions,
  share,
  stats,
  backHref,
  backLabel,
}: {
  /** The subject's picture (shared Avatar, 64px). */
  avatar: ReactNode;
  /** The kind word, e.g. the card's header word ("CHAIN HALL", "VALIDATOR"). */
  kind: string;
  /** The kind's colour token, the same one the card family uses. */
  kindColor: string;
  name: string;
  handle: string;
  /** Badges and facts that read at a glance (privacy, chain, verification). */
  chips?: ReactNode;
  /** The page's primary actions (Join / Watch / Vouch / Message …). */
  actions?: ReactNode;
  /** Share, when the route offers it. */
  share?: ReactNode;
  /**
   * The subject's counts, the ones its card face shows
   * (`cardFaceStats(card)`), values verbatim. A stat the server couldn't
   * count (value null or empty) is left out: no number rather than a
   * made-up 0. A text stat (e.g. a community's Access) is a fact, not a
   * count; it belongs in the chips or the Facts block, so it's left out too.
   */
  stats?: readonly CardStat[];
  backHref?: Route;
  backLabel?: string;
}) {
  const shownStats = (stats ?? []).filter(
    (stat) => stat.format !== "text" && stat.value !== null && stat.value !== "",
  );

  return (
    <header className={`${DETAIL_CONTAINER} mt-6`}>
      {backHref !== undefined && backLabel !== undefined && backLabel !== "" && (
        <Link
          href={backHref}
          className="bcc-mono inline-flex min-h-[44px] items-center text-bcc-text-secondary hover:text-bcc-text"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          ← {backLabel.toUpperCase()}
        </Link>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-4">
        <div className="shrink-0">{avatar}</div>

        <div className="min-w-0 flex-1 basis-[14rem]">
          <p
            className="bcc-mono"
            style={{ fontSize: "11px", letterSpacing: "0.24em", textTransform: "uppercase", color: kindColor }}
          >
            {kind}
          </p>
          <div className="flex items-start justify-between gap-3">
            <h1
              className="bcc-stencil text-bcc-text leading-[0.92]"
              style={{ fontSize: "clamp(1.75rem, 4.5vw, 3.25rem)", wordBreak: "break-word" }}
            >
              {name}
            </h1>
            {share !== undefined && <div className="shrink-0 pt-1">{share}</div>}
          </div>
          {handle !== "" && (
            <p className="bcc-mono mt-1 text-bcc-text-secondary" style={{ fontSize: "12px" }}>
              @{handle}
            </p>
          )}
          {chips !== undefined && <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div>}
        </div>

        {actions !== undefined && (
          // Beside the identity on wide screens; its own full-width row when
          // the identity takes the line (phones).
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">{actions}</div>
        )}
      </div>

      {shownStats.length > 0 && (
        // The 1px gaps over a border-coloured ground draw the dividers, so
        // they stay right when four or more counts wrap to two rows.
        <dl
          className={`mt-5 grid max-w-[640px] gap-px overflow-hidden rounded-[10px] border border-bcc-border bg-bcc-border ${headerStatsColumns(shownStats.length)}`}
        >
          {shownStats.map((stat, i) => (
            <div
              key={stat.key}
              className={`flex flex-col-reverse items-center bg-bcc-bg py-2 ${headerStatsCellSpan(shownStats.length, i)}`}
            >
              <dt className="bcc-mono text-bcc-text-secondary" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
                {stat.label}
              </dt>
              <dd className="bcc-stencil text-bcc-text" style={{ fontSize: "20px" }}>
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/**
 * The detail body: the main column (the tab strip and its panel) beside a
 * 300px side column of facts; on a phone the side blocks follow the main
 * column, so the tabs and first content come first.
 */
export function DetailBody({ main, side }: { main: ReactNode; side?: ReactNode }) {
  return (
    <div className={`${DETAIL_CONTAINER} mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]`}>
      <div className="min-w-0">{main}</div>
      {side !== undefined && <aside className="flex min-w-0 flex-col gap-4">{side}</aside>}
    </div>
  );
}

/** One block in the side column: a labelled panel. */
export function SideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="bcc-panel p-4">
      <h2 className="bcc-mono text-bcc-text-secondary" style={{ fontSize: "10px", letterSpacing: "0.2em" }}>
        {title.toUpperCase()}
      </h2>
      <div className="mt-2 font-serif text-bcc-text">{children}</div>
    </section>
  );
}
