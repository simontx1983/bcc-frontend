/**
 * post-card-data — map a `FeedItem` into the shared `OgCardData` shape
 * consumed by `renderOgCard`. Sibling to `entity-card-data.ts`, but
 * for the feed permalink rather than an entity profile.
 *
 * `FeedAuthor` (unlike the §L5 `Card` view-model) ships no server-
 * resolved `monogram_color` — per §A2 the frontend must not invent a
 * tier→color mapping, so every post card uses the fixed brand safety-
 * orange accent rather than a tier-derived crest color.
 */

import { deriveInitials } from "@/lib/format/initials";
import { presentationName } from "@/lib/format";
import { POST_KIND_LABELS } from "@/components/feed/FeedPostBody";
import type { FeedItem } from "@/lib/api/types";
import type { OgCardData } from "@/lib/og/card-image";

const POST_ACCENT = "#f98a1c";

export function postCardData(item: FeedItem): OgCardData {
  const name = presentationName({
    display_name: item.author.display_name ?? "",
    handle: item.author.handle,
  });
  const showHandle = item.author.handle !== "" && !item.author.handle.includes("@");
  const initials = deriveInitials(item.author.display_name ?? "", item.author.handle) || "??";
  const kindLabel = POST_KIND_LABELS[item.post_kind] ?? item.post_kind.toUpperCase();

  const chips: OgCardData["chips"] = [];
  const tierLabel = (item.author.tier_label ?? "").trim();
  if (tierLabel !== "") chips.push({ text: tierLabel, accent: true });
  const rankLabel = item.author.rank_label;
  if (typeof rankLabel === "string" && rankLabel !== "") {
    chips.push({ text: rankLabel, accent: false });
  }

  return {
    railLabel: kindLabel,
    name,
    handle: showHandle ? item.author.handle : "",
    monogramColor: POST_ACCENT,
    initials,
    chips,
    tagline: `${kindLabel} · ON THE FLOOR`,
  };
}
