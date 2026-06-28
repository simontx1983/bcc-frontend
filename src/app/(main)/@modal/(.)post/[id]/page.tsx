/**
 * (.)post/[id] — intercepts in-app navigation to `/post/[id]` and
 * renders it as a modal over the current feed via the `@modal`
 * parallel slot. Direct nav / hard refresh on this URL skips the
 * intercept and renders the full `/post/[id]/page.tsx` instead — that
 * route is the source of truth for SEO metadata and the OG image.
 *
 * Same SSR fetch + 404 handling as the full page; `PostModal` (client)
 * supplies the `<Dialog>` chrome and `router.back()` close behavior.
 */

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { PostModal } from "@/components/feed/PostModal";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { getFeedItemById } from "@/lib/api/feed-endpoints";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ intent?: string }>;
}

export default async function InterceptedPostModal({ params, searchParams }: PageProps) {
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

  return <PostModal item={item} focusComposer={intent === "comment"} />;
}
