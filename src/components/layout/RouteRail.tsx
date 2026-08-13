/**
 * RouteRail — the two-sided status strip at the top of an index route.
 *
 *   ● FLOOR // DIRECTORY                    FILE INDEX // ALL OPERATORS
 *
 * Dumb layout: both labels arrive pre-formatted. It takes two props and
 * is meant to keep taking two — a rail needing a third is a different
 * rail, not a configuration of this one.
 *
 * **Not interchangeable with `FileRail`**, which backs profile-style
 * detail pages:
 *
 *   | | `FileRail` | `RouteRail` |
 *   |---|---|---|
 *   | width | `max-w-[1440px]` | `max-w-[1560px]` |
 *   | padding | `px-4 py-3 sm:px-7` | `px-7 py-3` |
 *   | left | kicker + subject + owner chip | one label |
 *   | right | `JOINED …` / `FILE {n} // {status}` | one label |
 *
 * Index routes sit on the 1560px page grid, so rendering one through
 * `FileRail` would misalign the rail against the grid beneath it.
 *
 * No state, no hooks, no `"use client"` — importable from server and
 * client components alike.
 */

export interface RouteRailProps {
  /**
   * The left-hand label, rendered after the pulsing dot. Pre-formatted
   * by the caller, including its separator — e.g.
   * `"FLOOR \u00a0//\u00a0 DIRECTORY"` or `"BCC \u00a0//\u00a0 MESSAGES"`.
   *
   * Pass it through a JSX **expression** container, not a bare string
   * attribute: `kicker={"FLOOR \u00a0//\u00a0 MEMBERS"}`. JSX attribute
   * strings do not process backslash escapes, so a plain
   * `kicker="…"` attribute would render the six literal characters
   * backslash-u-0-0-a-0 instead of the space.
   */
  kicker: string;
  /**
   * The right-hand label. Same formatting contract as `kicker`, but it
   * may also be a runtime value (e.g. the conversation title on
   * `/messages/[id]`), in which case no escaping question arises.
   */
  label: string;
}

export function RouteRail({ kicker, label }: RouteRailProps) {
  return (
    <div className="border-b border-dashed border-bcc-border">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-bcc-text-secondary">
          <span className="bcc-rail-dot" aria-hidden />
          <span>{kicker}</span>
        </span>
        <span className="bcc-mono text-bcc-text-secondary">{label}</span>
      </div>
    </div>
  );
}
