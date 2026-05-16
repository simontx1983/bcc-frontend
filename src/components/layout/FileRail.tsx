/**
 * FileRail — top status strip shared across every "profile-style" page
 * (member profile, entity profile, group/community, local).
 *
 * Originally inlined in /u/[handle]/page.tsx as the canonical shape;
 * extracted here so /v, /p, /c can read identically. The dashed
 * bottom-border + the FLOOR // {kind} // @subject vocabulary anchors
 * the page in the "operator file" metaphor.
 *
 * Visual rhythm (left → right):
 *
 *   ● FLOOR // {KIND}  {@subject}  · YOU (owner-only)
 *                                       JOINED {date}   FILE 0001 // OPEN
 *
 *  Server component, no state.
 */

import type { ReactNode } from "react";

export interface FileRailProps {
  /**
   * The kind label rendered after `FLOOR //`. Examples: `"OPERATOR"`
   * (member profiles), `"VALIDATOR"`, `"PROJECT"`, `"CREATOR"`,
   * `"COMMUNITY"`, `"LOCAL"`. Caller passes UPPER-CASE; the rail
   * doesn't transform.
   */
  kind: string;
  /**
   * The page's primary subject identifier. Rendered in safety-cream
   * after the kicker. Caller pre-formats (e.g. `@PHILLIP`, the entity
   * handle, the group slug) so the rail stays a dumb layout.
   */
  subject: string;
  /**
   * Owner viewpoint tag — when true, the trailing `· YOU` chip renders.
   * Quietly confirms "this is your public view." For non-self / non-
   * applicable surfaces, omit or pass false.
   */
  isOwner?: boolean;
  /**
   * Pre-formatted joined / created label (e.g. `"MAY 2026"`,
   * `"OCT 2025"`). Surfaces as `JOINED {label}` on the right. Pass
   * null when the surface has no meaningful creation date.
   */
  joinedLabel?: string | null;
  /**
   * The file number rendered on the right. Defaults to `"0001"` to
   * match /u/[handle]'s canonical "FILE 0001 // OPEN" — pages can
   * override (e.g. /v could use a zero-padded card id, /communities
   * could use a stable group number).
   */
  fileNumber?: string;
  /**
   * Status word after the file number. Defaults to `"OPEN"`. Other
   * canonical values: `"CLOSED"`, `"PENDING"`, `"SECRET"` (per the
   * group-privacy taxonomy).
   */
  status?: string;
  /**
   * Optional extra meta nodes inserted between JOINED and FILE on the
   * right side. Caller-rendered (already formatted as
   * `<span className="bcc-mono">…</span>` etc).
   */
  extraMeta?: ReactNode;
}

export function FileRail({
  kind,
  subject,
  isOwner = false,
  joinedLabel,
  fileNumber = "0001",
  status = "OPEN",
  extraMeta,
}: FileRailProps) {
  return (
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-7">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; {kind.toUpperCase()}</span>
          <span className="text-cardstock">{subject}</span>
          {isOwner && (
            <span className="text-phosphor">&nbsp;·&nbsp;YOU</span>
          )}
        </span>
        <span className="bcc-mono inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-cardstock/50">
          {joinedLabel !== null && joinedLabel !== undefined && joinedLabel !== "" && (
            <span>JOINED&nbsp;{joinedLabel}</span>
          )}
          {extraMeta !== undefined && extraMeta !== null && extraMeta}
          <span>FILE {fileNumber}&nbsp;//&nbsp;{status.toUpperCase()}</span>
        </span>
      </div>
    </div>
  );
}
