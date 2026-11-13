/**
 * Split a profile's `halls[]` into the About page's HALLS and GROUPS cards.
 *
 * A pure partition on the server's `type` field — no role or label is
 * derived here. `role_label` is rendered verbatim by the caller, and a
 * null/absent one means no badge.
 */

import type { Route } from "next";

import type { MemberHall } from "@/lib/api/types";

interface MemberHallSplit {
  halls: MemberHall[];
  groups: MemberHall[];
}

export function splitMemberHalls(rows: readonly MemberHall[]): MemberHallSplit {
  // Old backends ship no `type` on any row, and on those `halls[]` has
  // only ever carried Halls — so when NO row has the field, every row is
  // a Hall (today's behaviour). Once the field ships, `"hall"` rows are
  // Halls and every other row — including one whose type is null — is a
  // group.
  const typed = rows.some((row) => row.type !== undefined);
  if (!typed) {
    return { halls: [...rows], groups: [] };
  }
  const halls: MemberHall[] = [];
  const groups: MemberHall[] = [];
  for (const row of rows) {
    if (row.type === "hall") halls.push(row);
    else groups.push(row);
  }
  return { halls, groups };
}

/**
 * Route for a membership row. Halls have their own detail route; every
 * other kind is served by the cross-kind `/communities/[slug]` page (the
 * same split GroupBlock.link documents). A row with no slug gets no link.
 */
export function memberHallHref(row: MemberHall, isHall: boolean): Route | null {
  if (row.slug === "") return null;
  const slug = encodeURIComponent(row.slug);
  return (isHall ? `/halls/${slug}` : `/communities/${slug}`) as Route;
}
