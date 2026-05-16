/**
 * remarkBccMentions — turn `@handle` text spans into `/u/{handle}` link
 * nodes inside blog body markdown.
 *
 * Scope of the V1 implementation:
 *   - Walks text nodes only (not headings, not code blocks).
 *   - Single-pattern regex match; sufficient for the V1 composer.
 *   - Does NOT cross-check against the precomputed `mentions[]` array
 *     (§3.3.12) for V1 — that integration is a V1.5 polish step.
 *     Result: `@handle` always renders as a chip-shaped link, even
 *     for handles that don't exist. The post-save hydrator will fix
 *     up the canonical display name once the server resolves.
 *
 * The regex matches `@[A-Za-z0-9_-]{1,50}` with a non-word lookbehind
 * to avoid stray `email@example.com` matches catching `@example`.
 */

import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import type { Plugin } from "unified";

import { makeLink, replaceTextMatches, type TextMatch } from "./textReplace";

const HANDLE_RX = /(^|[^A-Za-z0-9_-])@([A-Za-z0-9_-]{1,50})/g;

export const remarkBccMentions: Plugin<[], Root> = () => {
  return (tree) => {
    // NOTE on code-block safety: mdast `code` and `inlineCode` are
    // leaf nodes (value-only, no text-node children), so the visitor
    // never descends into them. No explicit skip-guard needed.
    visit(tree, "text", (node, _index, parent) => {
      if (parent === undefined) return;
      // Skip text inside an existing `link` — happens when (a) the
      // user wrote `[@x](url)` explicitly, or (b) `remark-gfm`'s
      // autolinker wrapped the @-mention before us. Walking into the
      // child text node and matching there would produce nested `<a>`
      // tags (invalid HTML; browsers collapse but the AST is wrong).
      if (parent.type === "link") return;

      const matches: TextMatch[] = [];
      let m: RegExpExecArray | null;
      HANDLE_RX.lastIndex = 0;
      while ((m = HANDLE_RX.exec(node.value)) !== null) {
        const leading = m[1] ?? "";
        const handle = m[2] ?? "";
        if (handle === "") continue;
        // The leading char (whitespace / punctuation / nothing) stays
        // in the surrounding text — only the `@handle` itself becomes
        // a link. Adjust index/match accordingly.
        matches.push({
          match: "@" + handle,
          index: m.index + leading.length,
          node: makeLink(`/u/${handle}`, "@" + handle, `Open @${handle}'s profile`),
        });
      }

      replaceTextMatches(node, parent, () => matches);
    });
  };
};
