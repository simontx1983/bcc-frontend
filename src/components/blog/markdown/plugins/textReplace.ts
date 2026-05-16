/**
 * Shared text-node replacer for the crypto-aware remark plugins.
 *
 * Each plugin in this directory walks the mdast tree, finds text
 * nodes outside `code`/`inlineCode` contexts, and replaces matched
 * regex spans with mixed text + link siblings. This helper is the
 * single place where the split-and-replace logic lives so each
 * pattern plugin stays a few lines.
 *
 * Why no parent walk for codeblocks: tx hashes, validator addresses,
 * and contract addresses appear as raw bytes inside `solidity` /
 * `bash` / `json` code blocks (the audience writes them constantly).
 * Auto-linking inside a fenced block would mangle the rendered
 * source. The replacer enforces this by accepting an
 * `ancestorTypes` callback the visitor passes in.
 */

import type { Link, PhrasingContent, Text } from "mdast";
import type { Parent } from "unist";

export interface TextMatch {
  /** Full matched substring. */
  match: string;
  /** Absolute index into the text node value. */
  index: number;
  /** Generated mdast node replacing the match. */
  node: PhrasingContent;
}

export type MatchFn = (text: string) => TextMatch[];

/**
 * Replace text-node spans in-place. The visitor caller is responsible
 * for skipping code/inlineCode ancestor chains; this helper does the
 * regex-to-AST conversion only.
 */
export function replaceTextMatches(
  text: Text,
  parent: Parent | undefined,
  matcher: MatchFn
): void {
  if (parent === undefined) return;
  if (typeof text.value !== "string" || text.value === "") return;

  const matches = matcher(text.value);
  if (matches.length === 0) return;

  // Build the replacement sequence — text fragments interleaved with
  // the matched nodes. Index drives the split; matches[] is assumed
  // sorted ascending and non-overlapping (each plugin's regex is
  // single-pattern, so overlaps don't happen within one plugin).
  const sorted = [...matches].sort((a, b) => a.index - b.index);
  const replacements: PhrasingContent[] = [];
  let cursor = 0;

  for (const m of sorted) {
    if (m.index < cursor) continue; // overlap guard
    if (m.index > cursor) {
      replacements.push({
        type: "text",
        value: text.value.slice(cursor, m.index),
      });
    }
    replacements.push(m.node);
    cursor = m.index + m.match.length;
  }

  if (cursor < text.value.length) {
    replacements.push({
      type: "text",
      value: text.value.slice(cursor),
    });
  }

  // Splice replacement nodes into the parent's children where the
  // original text node sat.
  const children = parent.children as PhrasingContent[];
  const idx = children.indexOf(text as PhrasingContent);
  if (idx < 0) return;
  children.splice(idx, 1, ...replacements);
}

/**
 * Make an mdast `link` node with a single text child. Convenience
 * factory so the plugins stay terse.
 */
export function makeLink(url: string, label: string, title?: string): Link {
  const node: Link = {
    type: "link",
    url,
    children: [{ type: "text", value: label }],
  };
  if (title !== undefined) node.title = title;
  return node;
}
