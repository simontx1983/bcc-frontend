/**
 * /u/[handle]/blog — §D6 per-user blog tab.
 *
 * Server shell that resolves the handle (404s on unknown) and forwards
 * to the client list. The actual blog feed is paginated via
 * useInfiniteQuery, so the body has to live in a client component.
 *
 * Per §D6, blog posts are FeedItems with `post_kind: 'blog_excerpt'` —
 * here they render in FULL VIEW (body.full_text), not as Floor excerpts.
 * The two contexts share the same backend storage; only the body
 * hydration differs (server-side, in BlogService).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";

import { UserBlogList } from "@/components/blog/UserBlogList";
import { getUser } from "@/lib/api/user-endpoints";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ handle: string }>;
}

export default async function UserBlogPage({ params }: PageProps) {
  const { handle } = await params;

  // Resolve the handle so the page 404s for unknown users + we can
  // surface the display name in the header. Anonymous reads are fine.
  let displayName = `@${handle}`;
  try {
    const profile = await getUser(handle, null);
    displayName = profile.display_name !== "" ? profile.display_name : `@${handle}`;
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const profileHref = `/u/${handle}` as Route;

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-3xl px-8 pt-12">
        <Link
          href={profileHref}
          className="bcc-mono inline-block text-[10px] tracking-[0.24em] text-cardstock-deep hover:text-cardstock"
        >
          ← BACK TO PROFILE
        </Link>
        <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
          {displayName}&apos;s blog
        </h1>
        <p className="mt-3 font-serif text-cardstock-deep">
          Long-form posts from @{handle}. Newest first.
        </p>
      </section>

      <section className="mx-auto mt-8 max-w-3xl px-8">
        <UserBlogList handle={handle} />
      </section>
    </main>
  );
}
