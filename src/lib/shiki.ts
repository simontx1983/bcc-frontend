/**
 * Shiki highlighter singleton — §D6 blog code blocks.
 *
 * react-markdown 10.x runs its unified pipeline via `runSync`, so an
 * async Shiki rehype plugin can't participate ("runSync finished
 * async"). This is path (b) from the original BlogMarkdownRenderer
 * V1 note: warm a module-level highlighter once — the promise kicks
 * off the moment this module is imported, i.e. when the blog chunk
 * loads — then let the renderer call the fully-sync `codeToHtml` on
 * the cached instance. Until the warm-up resolves, code blocks render
 * unstyled and re-render highlighted when it lands.
 *
 * Fine-grained core imports (not the `shiki` full bundle) keep the
 * client chunk to the JS regex engine + the grammars below instead of
 * the entire grammar registry / oniguruma WASM. `forgiving: true`
 * skips the rare grammar rule the JS engine can't translate instead
 * of throwing.
 */

import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Single baked-in theme — the blog prose surface sits on the dark
 * concrete palette in both site themes, so one dark code theme is
 * enough. Add a light twin here if the prose surface ever flips.
 */
const SHIKI_THEME = "github-dark";

let warmed: HighlighterCore | null = null;

/**
 * Warm-up promise — top-level so importing this module starts the
 * grammar/theme load immediately (no first-code-block latency).
 * Resolves `null` on failure (offline chunk-load etc.) so nothing
 * upstream has to attach a catch; consumers just stay on the
 * unstyled fallback.
 */
export const shikiReady: Promise<HighlighterCore | null> =
  createHighlighterCore({
    themes: [import("shiki/dist/themes/github-dark.mjs")],
    // Grammars worth their bundle weight for BCC long-form posts —
    // web stack + the chains BCC operators actually write about.
    // Solidity is the reason we're on Shiki instead of highlight.js
    // (path (a) in the old note had no Solidity grammar).
    langs: [
      import("shiki/dist/langs/javascript.mjs"),
      import("shiki/dist/langs/typescript.mjs"),
      import("shiki/dist/langs/jsx.mjs"),
      import("shiki/dist/langs/tsx.mjs"),
      import("shiki/dist/langs/json.mjs"),
      import("shiki/dist/langs/bash.mjs"),
      import("shiki/dist/langs/python.mjs"),
      import("shiki/dist/langs/rust.mjs"),
      import("shiki/dist/langs/solidity.mjs"),
      import("shiki/dist/langs/sql.mjs"),
      import("shiki/dist/langs/yaml.mjs"),
    ],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  })
    .then((h) => {
      warmed = h;
      return h;
    })
    .catch(() => null);

/** Sync accessor — `null` until the warm-up promise resolves. */
export function getShiki(): HighlighterCore | null {
  return warmed;
}

/**
 * Sync highlight on the warmed singleton. Returns `null` before the
 * warm-up resolves (caller renders its unstyled fallback). Unknown /
 * unloaded languages fall back to the built-in `text` grammar instead
 * of throwing, which also covers fence tags we didn't bundle.
 */
export function highlightCode(code: string, lang: string): string | null {
  if (warmed === null) {
    return null;
  }
  try {
    return warmed.codeToHtml(code, { lang, theme: SHIKI_THEME });
  } catch {
    return warmed.codeToHtml(code, { lang: "text", theme: SHIKI_THEME });
  }
}
