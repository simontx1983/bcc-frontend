/**
 * Crypto-aware remark plugins for the §D6 blog body renderer.
 *
 * Each plugin in this directory is a unified-pipeline remark plugin
 * that walks mdast text nodes and replaces matched spans with link
 * nodes. They are composable, side-effect-free, and skip code-block
 * ancestors (so a `0x…` inside a fenced solidity block stays raw).
 *
 * Order matters slightly: mentions run first so the `@` prefix is
 * claimed before auto-linking could accidentally match a stray
 * `@addr.eth` pattern (cf. ENS detection in remarkBccAutoLinks).
 */

import type { Plugin } from "unified";
import type { Root } from "mdast";

import { remarkBccMentions } from "./remarkBccMentions";
import { remarkBccEntityRefs } from "./remarkBccEntityRefs";
import { remarkBccAutoLinks } from "./remarkBccAutoLinks";

export const bccRemarkPlugins: ReadonlyArray<Plugin<[], Root>> = [
  remarkBccMentions,
  remarkBccEntityRefs,
  remarkBccAutoLinks,
];

export { remarkBccMentions, remarkBccEntityRefs, remarkBccAutoLinks };
