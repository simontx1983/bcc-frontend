"use client";

/**
 * Client wrapper for /blog/new. Mounts the BlogForm and routes to the
 * author's blog tab on a successful submit.
 *
 * Kept separate from the server-component page so BlogForm (which
 * uses TanStack Query mutations) doesn't need to be wrapped in
 * `dynamic({ ssr: false })`.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { BlogForm } from "@/components/composer/Composer";

interface BlogNewClientProps {
  handle: string;
}

export function BlogNewClient({ handle }: BlogNewClientProps) {
  const router = useRouter();
  const blogHref = `/u/${handle}/blog` as Route;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 pb-24 pt-12">
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <div>
          <p className="bcc-mono text-[11px] tracking-[0.24em] text-cardstock-deep/80">
            FLOOR // LONG-FORM
          </p>
          <h1
            className="bcc-stencil mt-1 text-cardstock leading-[1.05]"
            style={{ fontSize: "clamp(1.75rem, 4vw, 2.75rem)" }}
          >
            Write something worth the click.
          </h1>
          <p className="mt-2 max-w-2xl font-serif text-cardstock-deep/85">
            Long-form posts surface as excerpts on the Floor and render in
            full on your blog tab. Excerpt is the hook; body is the post.
          </p>
        </div>
        <Link
          href={blogHref}
          className="bcc-mono shrink-0 text-[11px] tracking-[0.18em] text-cardstock-deep/80 hover:text-cardstock hover:underline"
        >
          ← Your blog
        </Link>
      </header>

      <div className="bcc-panel flex flex-col gap-3 p-5 md:p-7">
        <BlogForm onSubmitSuccess={() => router.push(blogHref)} />
      </div>
    </main>
  );
}
