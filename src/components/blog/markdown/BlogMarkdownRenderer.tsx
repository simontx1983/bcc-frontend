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
import {
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Mention } from "@/lib/api/types";
import { getShiki, highlightCode, shikiReady } from "@/lib/shiki";

import { bccRemarkPlugins } from "./plugins";

// Syntax highlighting — path (b) from the old V1 note, now shipped:
// Shiki's grammar loader is async and react-markdown 10.x calls the
// unified pipeline via `runSync` (a Shiki rehype plugin would throw
// "runSync finished async"), so instead of a rehype plugin we warm a
// module-level Shiki singleton (src/lib/shiki.ts — the warm-up kicks
// off when this module is imported with the blog chunk) and highlight
// synchronously in the `pre` component override below. Before the
// warm-up resolves, fenced blocks render via react-markdown's default
// unstyled `<pre><code>` chrome and re-render highlighted once ready.

/**
 * Narrow react-markdown's `pre` children to the fenced-code `<code>`
 * element it emits (`<pre><code class="language-x">…`). Inline code
 * never sits inside a `pre`, so this only matches fenced blocks.
 */
function isFencedCode(
  node: ReactNode
): node is ReactElement<{ className?: string; children?: ReactNode }> {
  return isValidElement(node) && node.type === "code";
}

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
}: BlogMarkdownRendererProps) {
  // Shiki warm-up tracker — seeds from the singleton (already-warm on
  // every render after the first post), otherwise re-renders once the
  // module-level warm-up promise lands. `shikiReady` resolves null on
  // load failure, in which case we just stay on the unstyled fallback.
  const [shiki, setShiki] = useState(getShiki());
  useEffect(() => {
    if (shiki !== null) return;
    let cancelled = false;
    void shikiReady.then((h) => {
      if (!cancelled && h !== null) setShiki(h);
    });
    return () => {
      cancelled = true;
    };
  }, [shiki]);

  return (
    <div className="bcc-blog-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...bccRemarkPlugins]}
        disallowedElements={[...DISALLOWED_ELEMENTS]}
        unwrapDisallowed
        components={{
          pre: ({ children }) => {
            // Fenced code → sync Shiki highlight on the warmed
            // singleton. Anything that doesn't match (no language tag,
            // highlighter not warm yet, non-string children) falls
            // through to the plain <pre>.
            if (shiki !== null && isFencedCode(children)) {
              const match = /language-([\w+#-]+)/.exec(
                children.props.className ?? ""
              );
              const raw = children.props.children;
              if (match?.[1] !== undefined && typeof raw === "string") {
                const html = highlightCode(raw.replace(/\n$/, ""), match[1]);
                if (html !== null) {
                  return (
                    // XSS posture unchanged: Shiki escapes all code
                    // content before emitting markup, so the only HTML
                    // injected here is Shiki's own pre/span scaffolding
                    // (same guarantee that lets us keep rehype-raw out).
                    <div dangerouslySetInnerHTML={{ __html: html }} />
                  );
                }
              }
            }
            return <pre>{children}</pre>;
          },
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
