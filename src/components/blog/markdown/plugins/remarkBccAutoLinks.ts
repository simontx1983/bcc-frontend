/**
 * remarkBccAutoLinks — turn raw on-chain refs into block-explorer links.
 *
 * Three patterns recognized in V1:
 *   - EVM tx hash: `0x[0-9a-fA-F]{64}` → etherscan.io/tx/{hash}
 *     (defaults to mainnet etherscan; chain-aware routing is V1.5)
 *   - Cosmos tx hash: bare uppercase `[A-F0-9]{64}` (no `0x` prefix) →
 *     mintscan.io/cosmos/tx/{hash} (defaults to cosmos hub)
 *   - ENS name: lowercase `[a-z0-9-]+\.eth` token → app.ens.domains/{name}
 *
 * Skipped inside `inlineCode` / `code` parents — code blocks contain
 * literal hex strings as examples that should NOT auto-link.
 *
 * The displayed label is abbreviated for hex hashes (`TX 0x1234…abcd ↗`)
 * and full for ENS. Renderer's `<a>` override decides chip styling.
 */

import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import type { Plugin } from "unified";

import { makeLink, replaceTextMatches, type TextMatch } from "./textReplace";

// 0x-prefixed 64-hex (EVM tx hash; NOT 40-char addresses which are
// also valid hex but use the contract-ref syntax `$contract:` instead).
const EVM_TX_RX = /(^|[^0-9a-fA-Fx])(0x[0-9a-fA-F]{64})\b/g;

// Bare uppercase 64-hex (Cosmos tx hash). Must be preceded by a
// non-hex character to avoid false-matches inside longer hex strings.
const COSMOS_TX_RX = /(^|[^0-9A-Fx])([A-F0-9]{64})\b/g;

// ENS: single-segment lowercase `.eth`. Multi-segment subdomains
// (e.g., `vault.vitalik.eth`) NOT matched in V1 — too many false
// positives in prose.
const ENS_RX = /(^|[^A-Za-z0-9.-])([a-z0-9-]+\.eth)\b/g;

function abbrevHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

export const remarkBccAutoLinks: Plugin<[], Root> = () => {
  return (tree) => {
    // mdast `code` / `inlineCode` are leaf nodes — never parents of a
    // `text` node — so the visitor never descends inside them.
    visit(tree, "text", (node, _index, parent) => {
      if (parent === undefined) return;
      // Skip text already inside a `link` — happens when remark-gfm's
      // autolinker (or a prior plugin) wrapped the URL first. Walking
      // the inner text would re-match the hash inside the chip label.
      if (parent.type === "link") return;

      const matches: TextMatch[] = [];
      let m: RegExpExecArray | null;

      EVM_TX_RX.lastIndex = 0;
      while ((m = EVM_TX_RX.exec(node.value)) !== null) {
        const leading = m[1] ?? "";
        const hash = m[2] ?? "";
        if (hash === "") continue;
        matches.push({
          match: hash,
          index: m.index + leading.length,
          node: makeLink(
            `https://etherscan.io/tx/${hash}`,
            `TX ${abbrevHash(hash)} ↗`,
            "View transaction on Etherscan"
          ),
        });
      }

      COSMOS_TX_RX.lastIndex = 0;
      while ((m = COSMOS_TX_RX.exec(node.value)) !== null) {
        const leading = m[1] ?? "";
        const hash = m[2] ?? "";
        if (hash === "") continue;
        // Skip if this position is already claimed by an EVM hash
        // (overlap guard for collisions with `0x` matches).
        const startIdx = m.index + leading.length;
        if (matches.some((x) => x.index === startIdx)) continue;
        matches.push({
          match: hash,
          index: startIdx,
          node: makeLink(
            `https://www.mintscan.io/cosmos/tx/${hash}`,
            `TX ${abbrevHash(hash)} ↗`,
            "View transaction on Mintscan"
          ),
        });
      }

      ENS_RX.lastIndex = 0;
      while ((m = ENS_RX.exec(node.value)) !== null) {
        const leading = m[1] ?? "";
        const name = m[2] ?? "";
        if (name === "" || name === ".eth") continue;
        matches.push({
          match: name,
          index: m.index + leading.length,
          node: makeLink(
            `https://app.ens.domains/${name}`,
            name,
            "Open ENS profile"
          ),
        });
      }

      replaceTextMatches(node, parent, () => matches);
    });
  };
};
