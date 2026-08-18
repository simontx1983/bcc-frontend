/**
 * E4 — feed, composer, messages and notifications move off
 * `--bcc-text-muted`, plus the placeholder-token repair and the shared
 * character-counter tone ladder.
 *
 * 37 occurrences were in this area: 24 migrated, 3 placeholders moved to
 * the repaired `--bcc-text-placeholder`, 10 preserved.
 *
 * A further **4** colour-bearing occurrences left the tree outside that
 * area — the blog counter callers (`BlogComposer`, `BodyEditor`,
 * `SourcesField`, `TitleInput`), whose muted bottom rungs went with them
 * when they adopted the shared ladder. Those files belong to E5, but a
 * shared helper must not be half-adopted, so all its callers moved at
 * once. Repo-wide colour-bearing muted therefore falls 109 -> 78: 27
 * in-area plus these 4.
 *
 * ## The placeholder token was broken, and one consumer could not be fixed
 *
 * `--bcc-text-placeholder` measured **1.81:1 light / 1.76:1 dark** against
 * `--bcc-input-bg` — placeholder copy is readable text and WCAG grants it
 * no exemption. Repaired to `#5f626a` / `#82878f`, which clears 4.5:1 on
 * every bounded consumer while staying weaker than both `--bcc-text` and
 * `--bcc-text-secondary`, so a placeholder still reads as a placeholder.
 *
 * **`.bcc-search-input` is deliberately excluded.** It sits on
 * `--bcc-glass-bg-frosted` with a `backdrop-filter`, so arbitrary page
 * content scrolls beneath it and no value can be verified — the same
 * unbounded-backdrop class E1e documented for the header wordmark. It now
 * reads a separate `--bcc-search-placeholder` holding the *old* values, so
 * the header's computed appearance is unchanged.
 *
 * That is containment, not a fix. The header search placeholder is still
 * failing; it is isolated so it cannot hold 21 sound consumers hostage.
 * Two instances are affected: the desktop header field and the mobile
 * search overlay, both via `inputClassName="bcc-search-input"`.
 *
 * ## The counter ladder is shared as a helper, not a component
 *
 * Seven counters re-implemented the same escalation. A component absorbing
 * all seven would need eleven props, because their markup genuinely is not
 * standard — one renders a `<p>`, two write `n/max` where five write
 * `n / max`, two carry suffix children, one has `id` + `aria-live` +
 * `hidden`. Only the ladder repeats, so only the ladder is shared.
 *
 * Nine call sites across seven files: the seven inventoried counters, plus
 * two ladders in `Composer` that were already on `--bcc-text-secondary`.
 * Those two were never muted and were correctly outside the inventory, but
 * leaving them hand-rolled beside the helper in the same file would have
 * been the exact inconsistency the extraction exists to remove.
 *
 * The top rung stays `text-safety` and is NOT repaired here. It measures
 * 3.39:1 in light theme and is separately scoped work.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { counterToneClass } from "@/lib/counter-tone";

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

const F = "src/components/feed";
const M = "src/components/messages";
const B = "src/components/blog";
const COMPOSER = "src/components/composer/Composer.tsx";
const DRAWER = `${F}/CommentDrawer.tsx`;
const GIF = `${F}/CommentGifPicker.tsx`;

const MUTED = /text-bcc-text-muted|text-\[var\(--bcc-text-muted\)\]|color:\s*"?var\(--bcc-text-muted\)/;

// ─────────────────────────────────────────────────────────────────────────
// 1. Token values
// ─────────────────────────────────────────────────────────────────────────

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const tokenValues = (name: string) =>
  [...CSS.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

describe("E4 — the repaired placeholder token", () => {
  it("holds the approved light/dark values in all three scopes", () => {
    expect(tokenValues("bcc-text-placeholder")).toEqual(["#5f626a", "#82878f", "#82878f"]);
  });

  it("clears 4.5:1 on --bcc-input-bg in both themes", () => {
    const bg = tokenValues("bcc-input-bg");
    expect(ratio("#5f626a", bg[0] ?? "")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("#82878f", bg[1] ?? "")).toBeGreaterThanOrEqual(4.5);
  });

  it("stays weaker than entered text and than secondary — a placeholder still reads as one", () => {
    const bg = tokenValues("bcc-input-bg");
    const text = tokenValues("bcc-text");
    const sec = tokenValues("bcc-text-secondary");
    for (const i of [0, 1]) {
      const b = bg[i] ?? "";
      expect(ratio("#5f626a#82878f".slice(i * 7, i * 7 + 7), b)).toBeLessThan(ratio(text[i] ?? "", b));
      expect(ratio("#5f626a#82878f".slice(i * 7, i * 7 + 7), b)).toBeLessThan(ratio(sec[i] ?? "", b));
    }
  });

  it("the old failing values are gone", () => {
    const all = tokenValues("bcc-text-placeholder");
    expect(all).not.toContain("#b3b8c3");
    expect(all).not.toContain("#3d444d");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Header isolation — containment, not a fix
// ─────────────────────────────────────────────────────────────────────────

describe("E4 — .bcc-search-input is isolated, and still broken", () => {
  it("a separately named token exists, holding the pre-repair values", () => {
    expect(tokenValues("bcc-search-placeholder")).toEqual(["#b3b8c3", "#3d444d", "#3d444d"]);
  });

  it("the header rule reads the deferred token, not the repaired one", () => {
    const rule = /\.bcc-search-input::placeholder\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(rule).toContain("var(--bcc-search-placeholder)");
    expect(rule).not.toContain("var(--bcc-text-placeholder)");
  });

  it("the header's computed appearance is unchanged", () => {
    // Same values it had before the repair — this slice must not alter the
    // header's look while its backdrop problem remains unsolved.
    expect(tokenValues("bcc-search-placeholder")[0]).toBe("#b3b8c3");
  });

  it("records WHY it is excluded: an unbounded frosted-glass backdrop", () => {
    const block = /\.bcc-search-input\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(block).toContain("--bcc-glass-bg-frosted");
    expect(block).toContain("backdrop-filter");
  });

  it("is still failing — this is containment, and must not be read as a pass", () => {
    // Documented, not repaired. If someone later "tidies" this token to the
    // repaired values without solving the glass, this fails and asks why.
    const light = tokenValues("bcc-search-placeholder")[0] ?? "";
    expect(ratio(light, "#ffffff")).toBeLessThan(4.5);
  });

  it("only the two known header instances use the class", () => {
    const header = read("src/components/layout/SiteHeader.tsx");
    const uses = [...header.matchAll(/bcc-search-input/g)];
    expect(uses).toHaveLength(2); // desktop field + mobile overlay
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The three migrated placeholders
// ─────────────────────────────────────────────────────────────────────────

describe("E4 — hardcoded muted placeholders now use the token", () => {
  for (const [label, file] of [
    ["Composer", COMPOSER],
    ["CommentDrawer", DRAWER],
    ["CommentGifPicker", GIF],
  ] as const) {
    it(`${label} reads placeholder:text-[var(--bcc-text-placeholder)]`, () => {
      const src = read(file);
      expect(src).toContain("placeholder:text-[var(--bcc-text-placeholder)]");
      expect(src).not.toContain("placeholder:text-[var(--bcc-text-muted)]");
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The shared counter ladder
// ─────────────────────────────────────────────────────────────────────────

describe("counterToneClass — the shared ladder", () => {
  it("escalates over the limit", () => {
    expect(counterToneClass(101, 100)).toBe("text-safety");
    expect(counterToneClass(101, 100, 90)).toBe("text-safety");
  });
  it("warns only when a threshold is given", () => {
        // Was "text-warning" until 2026-08-18. That class named no Tailwind key
    // and compiled to nothing, so this rung was invisible; see
    // warning-utility-emission.test.ts.
    expect(counterToneClass(95, 100, 90)).toBe("text-bcc-warning");
    expect(counterToneClass(95, 100)).toBe("text-bcc-text-secondary");
  });
  it("rests on secondary, never muted", () => {
    expect(counterToneClass(10, 100, 90)).toBe("text-bcc-text-secondary");
    expect(counterToneClass(0, 100)).toBe("text-bcc-text-secondary");
  });
  it("boundaries are exclusive — at the limit is not over it", () => {
    expect(counterToneClass(100, 100, 90)).toBe("text-bcc-warning");
    expect(counterToneClass(90, 100, 90)).toBe("text-bcc-text-secondary");
  });
  it("leaves the safety rung alone — separately scoped, still failing", () => {
    // Comments stripped: the header explains WHICH token this replaced, so
    // asserting on raw text would fail on the documentation itself.
    const body = read("src/lib/counter-tone.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(body).toContain("text-safety");
    expect(body).not.toContain("bcc-text-muted");
  });
});

describe("E4 — every counter caller adopted the helper", () => {
  const CALLERS = [
    [`${B}/BodyEditor.tsx`, "BLOG_FULL_TEXT_MAX_LENGTH - 1000"],
    [`${B}/TitleInput.tsx`, "BLOG_TITLE_MAX_LENGTH - 20"],
    [`${B}/SourcesField.tsx`, "BLOG_SOURCE_LEN_MAX"],
    [`${B}/BlogComposer.tsx`, "BLOG_EXCERPT_MAX_LENGTH - 50"],
    [COMPOSER, "STATUS_POST_MAX_LENGTH - 50"],
    [`${M}/MessageComposer.tsx`, "MESSAGE_BODY_MAX_LENGTH"],
    [DRAWER, "COMMENT_MAX_LENGTH"],
  ] as const;

  for (const [file, threshold] of CALLERS) {
    it(`${file.split("/").pop()} imports and calls it with ${threshold}`, () => {
      const src = read(file);
      expect(src).toContain('import { counterToneClass } from "@/lib/counter-tone";');
      expect(src).toContain("counterToneClass(");
      expect(src).toContain(threshold);
    });
  }

  it("no hand-rolled ladder survives in any caller", () => {
    for (const [file] of CALLERS) {
      // Either spelling: a hand-rolled ladder written with the NEW class
      // would otherwise slip past this negative assertion.
      expect(read(file), `${file} still hand-rolls the ladder`).not.toMatch(
        /\?\s*"text-safety"\s*\n?\s*:\s*.*\?\s*\n?\s*"text-(bcc-)?warning"/,
      );
    }
  });

  it("Composer adopted all four of its ladders, not just the muted one", () => {
    // Two were already on secondary. Leaving them hand-rolled would have put
    // the helper and two copies of the same ladder in one file.
    const calls = [...read(COMPOSER).matchAll(/counterToneClass\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(read(COMPOSER)).not.toContain('? "text-warning"');
    expect(read(COMPOSER)).not.toContain('? "text-bcc-warning"');
  });
});

describe("E4 — each caller's markup and ARIA survived the extraction", () => {
  it("MessageComposer keeps id, aria-live and hidden on the counter", () => {
    const src = read(`${M}/MessageComposer.tsx`);
    expect(src).toContain('id="message-composer-counter"');
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain("hidden={body.length < MESSAGE_BODY_MAX_LENGTH - 200}");
  });
  it("CommentDrawer's counter is still a <p>, not standardised into a span", () => {
    const src = read(DRAWER).replace(/\r\n/g, "\n");
    expect(src).toContain('"bcc-mono ml-1 min-w-0 truncate text-[10px] " +\n                    counterToneClass(');
  });
  it("the tight and spaced separators are both preserved", () => {
    expect(read(`${M}/MessageComposer.tsx`)).toContain("{body.length}/{MESSAGE_BODY_MAX_LENGTH}");
    expect(read(`${B}/TitleInput.tsx`)).toContain("{len} / {BLOG_TITLE_MAX_LENGTH}");
  });
  it("BlogComposer's under-minimum error stays its own condition", () => {
    const src = read(`${B}/BlogComposer.tsx`);
    expect(src).toContain("excerptUnderMin");
    expect(src).toContain('? "text-safety"');
  });
  it("suffix children survived", () => {
    expect(read(`${B}/BlogComposer.tsx`)).toContain("(need ≥ {BLOG_EXCERPT_MIN_LENGTH})");
    expect(read(COMPOSER)).toContain("· 1 photo");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Hover ladders and exact exclusions
// ─────────────────────────────────────────────────────────────────────────

describe("E4 — hover ladders keep a visible step", () => {
  const src = read(DRAWER);
  it("the two that would have collapsed now hover to --bcc-text", () => {
    // Both rested on muted and hovered to secondary. Lifting rest alone
    // would have made hover a no-op.
    expect(src).not.toContain("hover:text-[var(--bcc-text-secondary)]");
    expect(src).toContain(
      'text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]',
    );
  });
  it("the surface-change hover kept its background step too", () => {
    expect(src).toContain(
      'text-[var(--bcc-text-secondary)] hover:bg-[var(--bcc-surface-active)] hover:text-[var(--bcc-text)]',
    );
  });
});

describe("E4 — the ten preserved sites", () => {
  const PRESERVED: ReadonlyArray<readonly [string, number]> = [
    [COMPOSER, 4], // three disabled submits + two disabled icon buttons share lines
    [DRAWER, 2],
    [`${F}/ReportButton.tsx`, 1],
    ["src/components/notifications/NotificationsPanel.tsx", 1],
    [`${M}/ConversationsPanel.tsx`, 1],
  ];
  for (const [file, atLeast] of PRESERVED) {
    it(`${file.split("/").pop()} still has its disabled/decorative muted uses`, () => {
      const hits = [...read(file).matchAll(/text-bcc-text-muted|text-\[var\(--bcc-text-muted\)\]|color: "var\(--bcc-text-muted\)"/g)];
      expect(hits.length).toBeGreaterThanOrEqual(atLeast);
    });
  }

  it("every surviving muted use in the E4 area is disabled or decorative", () => {
    const FILES = [
      COMPOSER, DRAWER, GIF, `${F}/FeedView.tsx`, `${F}/PostActionBar.tsx`, `${F}/ReportButton.tsx`,
      `${M}/ConversationList.tsx`, `${M}/ConversationsPanel.tsx`, `${M}/MessageComposer.tsx`,
      `${M}/QueuedMessagesList.tsx`, `${M}/ThreadView.tsx`,
      "src/components/notifications/NotificationsPanel.tsx",
    ];
    const survivors: Array<{ label: string; line: string }> = [];
    for (const f of FILES) {
      read(f).split(/\r?\n/).forEach((l) => {
        if (MUTED.test(l)) survivors.push({ label: `${f.split("/").pop()} :: ${l.trim().slice(0, 70)}`, line: l });
      });
    }
    expect(survivors).toHaveLength(10);
    for (const s of survivors) {
      // Classify on the FULL line — several carry `disabled:` well past the
      // 70-char label used for readable failure output.
      expect(
        /cursor-not-allowed|cursor-wait|disabled:|aria-hidden|justifyContent/.test(s.line),
        `not clearly disabled/decorative: ${s.label}`,
      ).toBe(true);
    }
  });
});

describe("E4 — the measurement the slice rests on", () => {
  it("secondary clears AA where muted did not, both themes", () => {
    const bg = tokenValues("bcc-bg");
    const sec = tokenValues("bcc-text-secondary");
    const mut = tokenValues("bcc-text-muted");
    for (const i of [0, 1]) {
      expect(ratio(sec[i] ?? "", bg[i] ?? "")).toBeGreaterThanOrEqual(4.5);
      expect(ratio(mut[i] ?? "", bg[i] ?? "")).toBeLessThan(4.5);
    }
  });
});
