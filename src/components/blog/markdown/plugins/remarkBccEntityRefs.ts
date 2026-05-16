/**
 * remarkBccEntityRefs — replace `$validator:<bech32>` / `$contract:<0x…>`
 * tokens with entity-chip link nodes inside blog body markdown.
 *
 * Targets:
 *   - `$validator:<bech32-valoper>` → links to `/v/{token}` (BCC
 *     resolves the slug at render time; if the slug doesn't exist,
 *     the directory route returns 404 — acceptable V1 behavior).
 *   - `$contract:<0x[0-9a-fA-F]{1,}>` → links to
 *     `/directory?contract={addr}` (graceful fallback when the
 *     directory page isn't wired yet — the URL stays stable).
 *
 * The link's display label keeps the raw token (`$validator:akashvalop1…`)
 * so the reader sees what was typed, not a synthesized name. Visual
 * chip styling is owned by the renderer's `<a>` override.
 */

import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import type { Plugin } from "unified";

import { makeLink, replaceTextMatches, type TextMatch } from "./textReplace";

const VALIDATOR_RX = /\$validator:([a-z0-9]{8,})/g;
const CONTRACT_RX  = /\$contract:(0x[0-9a-fA-F]{4,})/g;

export const remarkBccEntityRefs: Plugin<[], Root> = () => {
  return (tree) => {
    // mdast `code` / `inlineCode` are leaf nodes — never parents of a
    // `text` node — so the visitor never descends inside them.
    visit(tree, "text", (node, _index, parent) => {
      if (parent === undefined) return;
      // Skip text already inside a `link` — author wrote
      // `[$contract:0x…](url)` explicitly, or another plugin wrapped
      // it first. Re-matching would produce nested anchors.
      if (parent.type === "link") return;

      const matches: TextMatch[] = [];

      let m: RegExpExecArray | null;

      VALIDATOR_RX.lastIndex = 0;
      while ((m = VALIDATOR_RX.exec(node.value)) !== null) {
        const token = m[1] ?? "";
        if (token === "") continue;
        matches.push({
          match: m[0],
          index: m.index,
          node: makeLink(
            `/v/${token}`,
            `$validator:${token}`,
            "Open validator page"
          ),
        });
      }

      CONTRACT_RX.lastIndex = 0;
      while ((m = CONTRACT_RX.exec(node.value)) !== null) {
        const addr = m[1] ?? "";
        if (addr === "") continue;
        matches.push({
          match: m[0],
          index: m.index,
          node: makeLink(
            `/directory?contract=${addr}`,
            `$contract:${addr}`,
            "Open contract page"
          ),
        });
      }

      replaceTextMatches(node, parent, () => matches);
    });
  };
};
