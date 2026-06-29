/**
 * /post/[id] — feed post permalink (full page, direct nav / refresh).
 * The in-app click-through opens the same content as an in-feed quick
 * view instead — see `PostQuickViewProvider`.
 *
 * Same shell pattern as `/p/[slug]`: server component + `generateMetadata`,
 * SSR fetch via `getFeedItemById`, 404 on `bcc_not_found`.
 */

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PostDetail } from "@/components/feed/PostDetail";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { getFeedItemById } from "@/lib/api/feed-endpoints";
import { buildPostMetadata } from "@/lib/og/post-metadata";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ intent?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return buildPostMetadata(id);
}

export default async function PostPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { intent } = await searchParams;
  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let item;
  try {
    item = await getFeedItemById(id, token);
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="mx-auto max-w-2xl px-3 py-4 sm:px-0">
      <Link
        href="/"
        className="bcc-mono mb-3 inline-flex items-center gap-1 text-[11px] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]"
      >
        ← Back to feed
      </Link>
      <PostDetail item={item} focusComposer={intent === "comment"} />
    </div>
  );
}
