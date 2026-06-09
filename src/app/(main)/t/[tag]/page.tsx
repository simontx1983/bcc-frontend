/**
 * /t/[tag] — posts carrying a single PeepSo hashtag.
 *
 * Server component. It only resolves + sanitizes the route param and
 * mounts the client <TagFeedView>; the actual fetch/render machinery
 * (useTagFeed + shared FeedBody) is client-side, matching the Floor
 * feed which is client-rendered (no SSR prefetch contract yet).
 *
 * The `tag` segment may arrive URL-encoded and/or with a leading "#"
 * (e.g. a `/t/%23validators` link); we decode and strip the "#" so the
 * value passed downstream is the bare word the API expects. An empty
 * result → notFound() rather than rendering a degenerate "#" header.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TagFeedView } from "@/components/feed/TagFeedView";

interface PageProps {
  params: Promise<{ tag: string }>;
}

function cleanTag(raw: string): string {
  return decodeURIComponent(raw).replace(/^#/, "");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag } = await params;
  const clean = cleanTag(tag);
  if (clean === "") {
    return { title: "Hashtag · Blue Collar Crypto" };
  }
  return { title: `#${clean} · Blue Collar Crypto` };
}

export default async function TagPage({ params }: PageProps) {
  const { tag } = await params;
  const clean = cleanTag(tag);

  if (clean === "") {
    notFound();
  }

  return (
    <main className="pb-24 pt-6">
      <TagFeedView tag={clean} />
    </main>
  );
}
