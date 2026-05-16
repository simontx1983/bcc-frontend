"use client";

/**
 * BlogMarkdownRenderer — shared §D6 markdown rendering pipeline.
 *
 * Mounted in two places:
 *   1. Composer preview (`<BodyEditor>`) — renders the author's
 *      in-progress draft as they type.
 *   2. Post-view (`<UserBlogList>`) — renders the final body on the
 *      blog tab.
 *
 * Single source of truth so the preview cannot drift from the
 * published render. Wraps `react-markdown` with:
 *
 *   - remark-gfm for tables / strikethrough / autolinks / footnotes
 *   - the three crypto-aware remark plugins (mentions, entity refs,
 *     auto-links)
 *   - rehype-pretty-code + Shiki for syntax-highlighted code blocks
 *   - `disallowedElements` + `unwrapDisallowed` for XSS safety (no
 *     `<script>`, `<iframe>`, `<object>`, `<embed>`, `<style>`; no
 *     `rehype-raw`, so HTML in markdown is escaped, not rendered)
 *
 * The renderer overrides anchor (`a`) rendering: internal links
 * (starting with `/`) use Next.js `<Link>` for client-side nav;
 * external links open in a new tab with `rel="noopener noreferrer"`
 * + a subtle external-link chip styling.
 *
 * §3.3.12 invariant: mentions[] offsets reference RAW stored content.
 * The remarkBccMentions plugin renders `@handle` as a plain
 * `/u/{handle}` Link without cross-checking the mentions array — that
 * cross-check is a V1.5 polish step (would let us swap in canonical
 * display names from the resolved overlay).
 */

import Link from "next/link";
import type { Route } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Mention } from "@/lib/api/types";

import { bccRemarkPlugins } from "./plugins";

// V1: code blocks render unstyled via react-markdown's default `<pre><code>`
// chrome. Syntax highlighting was prototyped with rehype-pretty-code +
// Shiki, but Shiki's grammar loader is async and react-markdown 10.x
// calls the unified pipeline via `runSync`, which throws
// "runSync finished async" when a Shiki rehype plugin yields. Two V1.5
// paths land cleanly here: (a) swap in rehype-highlight (highlight.js,
// fully sync, no Solidity grammar though); (b) pre-warm a Shiki
// singleton in a layout-level loader so runSync sees a cached
// highlighter. Path (b) preserves the better grammar coverage.

interface BlogMarkdownRendererProps {
  body: string;
  /**
   * §3.3.12 overlay. Reserved for V1.5 mention-resolution polish;
   * V1 renderer accepts the prop but doesn't yet use it.
   */
  mentions?: Mention[];
}

const DISALLOWED_ELEMENTS = [
  "script",
  "iframe",
  "object",
  "embed",
  "style",
] as const;

export function BlogMarkdownRenderer({
  body,
  mentions: _mentions,
}: BlogMarkdownRendererProps) {
  return (
    <div className="bcc-blog-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...bccRemarkPlugins]}
        disallowedElements={[...DISALLOWED_ELEMENTS]}
        unwrapDisallowed
        components={{
          a: ({ href, children, title }) => {
            const url = href ?? "";
            const isInternal = url.startsWith("/");

            if (isInternal) {
              return (
                <Link
                  href={url as Route}
                  className="text-safety underline-offset-2 hover:underline"
                  {...(title !== undefined ? { title } : {})}
                >
                  {children}
                </Link>
              );
            }

            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-safety underline-offset-2 hover:underline"
                {...(title !== undefined ? { title } : {})}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
