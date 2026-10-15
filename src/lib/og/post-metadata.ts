/**
 * post-metadata — `generateMetadata` builder for the `/post/[id]` feed
 * permalink. Mirrors `buildEntityMetadata`'s shape (try/catch fetch,
 * minimal "not found" head on failure, no og:image entries — the
 * sibling `opengraph-image.tsx` / `twitter-image.tsx` convention
 * routes own those).
 *
 * Anonymous fetch (null token) — a pasted permalink and its OG crawler
 * both need this to resolve without auth, same posture as the entity
 * routes.
 */

import type { Metadata } from "next";

import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";
import { getFeedItemById } from "@/lib/api/feed-endpoints";
import { POST_KIND_LABELS, deriveBodySummary } from "@/components/feed/postBody";
import { presentationName } from "@/lib/format";
import type { FeedItem } from "@/lib/api/types";

export async function buildPostMetadata(id: string): Promise<Metadata> {
  let item: FeedItem;
  try {
    // Always anon here — metadata has no session — so this is safe to put
    // in the SHARED Data Cache and serve to every crawler and viewer. Same
    // argument, same constant, as the profile page's metadata read.
    //
    // ⚠ Without the `revalidate` this fetch was never cached at all, and
    // both post-detail routes go through here. Measured against a
    // recording API stub, two loads of one post:
    //
    //   anonymous   2 loads -> 2 upstream reads (should be 1)
    //   authed      2 loads -> 4 upstream reads (1 anon + 1 authed each)
    //   viewer B    right after A read the same post -> 2 more
    //
    // The anon leg is byte-identical for everyone, so every one of those
    // repeats was avoidable. The authed leg stays uncached on purpose —
    // a personalized response must never be shared.
    item = await getFeedItemById(id, null, {
      revalidate: ANON_SSR_REVALIDATE_SECONDS,
    });
  } catch {
    return { title: "Post not found · Blue Collar Crypto" };
  }

  const name = presentationName({
    display_name: item.author.display_name ?? "",
    handle: item.author.handle,
  });

  const blogTitle = item.post_kind === "blog_excerpt" ? readString(item.body, "title") : null;
  const title = blogTitle !== null ? `${blogTitle} · Blue Collar Crypto` : `${name} on Blue Collar Crypto`;

  const description = derivePostDescription(item, name);

  // Prefer the server-supplied self link (now `/post/{id}` per the
  // permalink fix) read verbatim per §A2.
  const canonical = item.links.self !== "" ? item.links.self : `/post/${encodeURIComponent(id)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function derivePostDescription(item: FeedItem, authorName: string): string {
  const body = item.body;

  if (item.post_kind === "review") {
    const text = readString(body, "text");
    if (text !== null) return text;
    const pageName = readString(body, "page_name");
    if (pageName !== null) return `${authorName} reviewed ${pageName} on the Floor.`;
  }

  if (item.post_kind === "blog_excerpt") {
    const excerpt = readString(body, "excerpt");
    if (excerpt !== null) return excerpt;
    const title = readString(body, "title");
    if (title !== null) return title;
  }

  const summary = deriveBodySummary(item);
  if (summary !== "") return summary;

  const kindLabel = (POST_KIND_LABELS[item.post_kind] ?? item.post_kind).toLowerCase();
  return `${authorName} · ${kindLabel} on the Floor — trust, identity, and reputation for crypto operators.`;
}

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value !== "" ? value : null;
}
