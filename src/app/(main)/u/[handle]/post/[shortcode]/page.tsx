/**
 * /u/[handle]/post/[shortcode] — canonical feed-post permalink.
 *
 * bcc-trust #82 rewrote every `links.self` to this shortcode scheme
 * (`CardUrlMap::postUrl(handle, code)`), so feed cards now soft-navigate
 * here. The 8-letter `shortcode` resolves server-side on the shared
 * `GET /feed/{id}` route (Phillip's sibling `[a-zA-Z]{8}` matcher), so we
 * pass it straight to `getFeedItemById` — same fetch the numeric
 * `/post/[id]` dev-fallback route uses. `handle` is canonical decoration
 * only; the shortcode alone identifies the post.
 *
 * Mirrors `/post/[id]/page.tsx`: server component + `generateMetadata`,
 * SSR fetch, 404 on `bcc_not_found`.
 */

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { PostBackButton } from "@/components/feed/PostBackButton";
import { PostDetail } from "@/components/feed/PostDetail";
import { PostRailRegistrar } from "@/components/feed/PostRailRegistrar";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { getFeedItemById } from "@/lib/api/feed-endpoints";
import { buildPostMetadata } from "@/lib/og/post-metadata";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ handle: string; shortcode: string }>;
  searchParams: Promise<{ intent?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shortcode } = await params;
  return buildPostMetadata(shortcode);
}

export default async function PostByShortcodePage({ params, searchParams }: PageProps) {
  const { shortcode } = await params;
  const { intent } = await searchParams;
  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let item;
  try {
    item = await getFeedItemById(shortcode, token);
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="mx-auto max-w-2xl px-3 py-4 sm:px-0">
      <PostBackButton />
      <PostRailRegistrar author={item.author} feedId={item.id} />
      <PostDetail item={item} focusComposer={intent === "comment"} />
    </div>
  );
}
