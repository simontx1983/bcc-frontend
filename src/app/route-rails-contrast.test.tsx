/**
 * E2 — route rails and list metadata: `text-bcc-text-muted` → `text-bcc-text-secondary`,
 * plus the `RouteRail` extraction that removed the duplication behind them.
 *
 * E1 fixed the `globals.css` half of the muted-text programme. This is the
 * first TSX slice: the seven index routes that open with a dashed rail
 * (`FILE INDEX // ALL OPERATORS`, `DIRECT // INBOX`, …) and the list and
 * conversation metadata rendered beside them.
 *
 * All the migrated sites are prose read at 9–14px on `--bcc-bg`, where
 * muted measures **2.54:1 light / 2.28:1 dark** and secondary measures
 * **7.56 / 6.15**. None is decorative, none is disabled, and none sits on
 * fixed cream paper — so the classification is unambiguous and the set
 * moves together.
 *
 * ## Why the extraction is in the same slice
 *
 * The seven rails were byte-identical private copies — 97 lines of
 * duplicated markup differing only in two label strings (the seventh also
 * took a `title` prop). Fixing the colour in seven places and *then*
 * extracting would have churned the same seven files twice, so
 * `RouteRail` landed here instead. The colour now lives in exactly one
 * component; the call sites carry only their labels.
 *
 * `FileRail` is deliberately **not** merged into it. The two differ in
 * width (1440 vs 1560), padding, and both label structures; index routes
 * sit on the 1560px page grid, so routing them through `FileRail` would
 * misalign the rail against the grid beneath it. `FileRail` keeps its own
 * assertions below, including that it did not drift toward `RouteRail`.
 *
 * ## What this guard is for
 *
 *   1. **The component's colour and geometry** — asserted once, since
 *      every rail now inherits from it, and rendered for real so the dot
 *      and both labels are proven present in the DOM rather than inferred
 *      from source text.
 *   2. **Each of the seven call sites, separately** — that it imports the
 *      shared component, passes the right labels, and has not re-grown a
 *      local rail. Re-cloning an old route is the most likely way this
 *      duplication comes back.
 *   3. **The six deliberate exclusions**, pinned as hard as the migrations:
 *      - **Four disabled pager spans** (`communities`, `halls` × prev/next).
 *        These are the `: (` branch of `hasPrev ? <Link…> : <span…>` — an
 *        inactive control, exempt under WCAG 1.4.3, and muted is doing real
 *        work: it is the only thing distinguishing "no previous page" from
 *        the live link beside it.
 *      - **Two `aria-hidden` ✕ glyphs** on filter chips, whose meaning is
 *        carried by the labelled button around them.
 *
 * Source anchoring is by surrounding content, never by line number.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RouteRail } from "@/components/layout/RouteRail";

const APP = "src/app/(main)/(app)";

const ROUTE_RAIL = "src/components/layout/RouteRail.tsx";
const FILE_RAIL = "src/components/layout/FileRail.tsx";
const MEMBERS = `${APP}/members/page.tsx`;
const DIRECTORY = `${APP}/directory/page.tsx`;
const VALIDATORS = `${APP}/validators/page.tsx`;
const MENTORS = `${APP}/mentors/page.tsx`;
const MESSAGES = `${APP}/messages/page.tsx`;
const MESSAGES_NEW = `${APP}/messages/new/page.tsx`;
const MESSAGES_ID = `${APP}/messages/[id]/page.tsx`;
const COMMUNITIES = `${APP}/communities/page.tsx`;
const HALLS = `${APP}/halls/page.tsx`;

/** Every file in E2's blast radius, including the two it must not have changed. */
const FILE_SET = [
  MEMBERS,
  DIRECTORY,
  VALIDATORS,
  MENTORS,
  MESSAGES,
  MESSAGES_NEW,
  MESSAGES_ID,
  COMMUNITIES,
  HALLS,
  FILE_RAIL,
  ROUTE_RAIL,
] as const;

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

/**
 * Find the colour-bearing line for the element rendering `anchor`.
 *
 * Used only for the metadata sites that are still authored inline in the
 * page files — the rails themselves are now asserted through `RouteRail`.
 * The anchor must match exactly one line; an ambiguous anchor throws
 * rather than silently asserting against the wrong element.
 */
function colourLineFor(path: string, anchor: string): string {
  const lines = read(path).split(/\r?\n/);
  const hits: number[] = [];
  lines.forEach((l, i) => {
    if (l.includes(anchor)) hits.push(i);
  });
  if (hits.length !== 1) {
    throw new Error(
      `anchor ${JSON.stringify(anchor)} matched ${hits.length} lines in ${path} — expected exactly 1`,
    );
  }
  const start = hits[0] ?? 0;
  for (let i = start; i >= 0 && i > start - 8; i -= 1) {
    const line = lines[i] ?? "";
    if (line.includes("text-bcc-text-")) return line;
  }
  throw new Error(`no text-bcc-text-* class within 8 lines above ${anchor} in ${path}`);
}

const NBSP = "\u00a0";

/** Source spelling of a label: the escape, never a raw non-breaking space. */
function escaped(s: string): string {
  return s.replace(/\u00a0/g, "\\u00a0");
}

/**
 * Strip comments so "this file must not contain X" assertions test code
 * rather than prose. `RouteRail`'s own header explains at length how it
 * differs from `FileRail` — it names `FLOOR`, `max-w-[1440px]` and
 * `FileRail` itself. Asserting against the raw text would fail on the
 * documentation that exists precisely to prevent the confusion.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ─────────────────────────────────────────────────────────────────────────
// 1. The shared component — asserted once
// ─────────────────────────────────────────────────────────────────────────

describe("RouteRail — the one place the rail's colour and geometry live", () => {
  afterEach(cleanup);

  const SRC = read(ROUTE_RAIL);

  it("renders the dot and both labels, non-breaking spaces intact", () => {
    // Identity normalizer: RTL's default collapses whitespace, and U+00A0
    // is whitespace to `\s`, so the default would happily match a version
    // of the label with the non-breaking spaces flattened to ordinary
    // ones. That is exactly the regression this needs to catch.
    const exact = { normalizer: (t: string) => t };
    const kicker = `FLOOR ${NBSP}//${NBSP} DIRECTORY`;
    const label = `FILE INDEX ${NBSP}//${NBSP} ALL OPERATORS`;
    render(<RouteRail kicker={kicker} label={label} />);
    expect(screen.getByText(kicker, exact)).toBeInTheDocument();
    expect(screen.getByText(label, exact)).toBeInTheDocument();
  });

  it("the dot is decorative — present, and hidden from assistive tech", () => {
    const { container } = render(<RouteRail kicker="A" label="B" />);
    const dot = container.querySelector(".bcc-rail-dot");
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    // No text of its own — it must never become the accessible name.
    expect(dot?.textContent).toBe("");
  });

  it("both label spans carry --bcc-text-secondary, and neither carries muted", () => {
    const { container } = render(<RouteRail kicker="LEFT" label="RIGHT" />);
    const left = screen.getByText("LEFT").parentElement;
    const right = screen.getByText("RIGHT");
    expect(left?.className).toContain("text-bcc-text-secondary");
    expect(right.className).toContain("text-bcc-text-secondary");
    expect(container.innerHTML).not.toContain("text-bcc-text-muted");
  });

  it("keeps the 1560px page-grid geometry the seven rails were authored with", () => {
    // Copied verbatim from the deleted local rails. Drifting to FileRail's
    // 1440/px-4 sm:px-7 would misalign the rail against the grid below it.
    const body = code(SRC);
    expect(body).toContain(
      'className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3"',
    );
    expect(body).toContain('className="border-b border-dashed border-bcc-border"');
    expect(body).not.toContain("max-w-[1440px]");
    expect(body).not.toContain("sm:px-7");
  });

  it("takes exactly two props — it is not allowed to grow into FileRail", () => {
    const props = [...code(SRC).matchAll(/^ {2}(\w+): /gm)].map((m) => m[1]);
    expect(props).toEqual(["kicker", "label"]);
  });

  it("hardcodes no label text of its own", () => {
    // Every visible string is a prop. If a kicker word ever gets baked in
    // here, the next route that needs a different one clones the file.
    const body = code(SRC);
    expect(body).not.toContain("FLOOR");
    expect(body.includes("FILE INDEX")).toBe(false);
    // …and no raw non-breaking spaces anywhere, including its own comments.
    expect(SRC).not.toContain(NBSP);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The seven call sites — asserted separately
// ─────────────────────────────────────────────────────────────────────────

interface CallSite {
  readonly route: string;
  readonly file: string;
  readonly kicker: string;
  /** `null` where the right-hand label is a runtime value. */
  readonly label: string | null;
  /** Extra literal `label=` spellings expected in the file. */
  readonly rawLabels?: readonly string[];
}

const CALL_SITES: readonly CallSite[] = [
  { route: "/members", file: MEMBERS, kicker: `FLOOR ${NBSP}//${NBSP} MEMBERS`, label: `FILE INDEX ${NBSP}//${NBSP} ALL OPERATORS` },
  { route: "/directory", file: DIRECTORY, kicker: `FLOOR ${NBSP}//${NBSP} DIRECTORY`, label: `FILE INDEX ${NBSP}//${NBSP} ALL OPERATORS` },
  { route: "/validators", file: VALIDATORS, kicker: `FLOOR ${NBSP}//${NBSP} VALIDATORS`, label: `FILE INDEX ${NBSP}//${NBSP} STAKING OPERATORS` },
  { route: "/mentors", file: MENTORS, kicker: `FLOOR ${NBSP}//${NBSP} MENTORS`, label: `FILE INDEX ${NBSP}//${NBSP} LISTED MENTORS` },
  { route: "/messages", file: MESSAGES, kicker: `BCC ${NBSP}//${NBSP} MESSAGES`, label: `DIRECT ${NBSP}//${NBSP} INBOX` },
  { route: "/messages/new", file: MESSAGES_NEW, kicker: `BCC ${NBSP}//${NBSP} MESSAGES`, label: `DIRECT ${NBSP}//${NBSP} NEW` },
  {
    route: "/messages/[id]",
    file: MESSAGES_ID,
    kicker: `BCC ${NBSP}//${NBSP} MESSAGES`,
    label: null,
    // The two arguments the deleted <Rail title=…> received, unchanged.
    rawLabels: ['label="UNKNOWN"', "label={resolveRailTitle(query)}"],
  },
];

for (const site of CALL_SITES) {
  describe(`${site.route} — uses the shared rail`, () => {
    const src = read(site.file);

    it("imports RouteRail", () => {
      expect(src).toContain('import { RouteRail } from "@/components/layout/RouteRail";');
    });

    it("has no local rail implementation left", () => {
      // The extraction deleted these outright — no thin wrappers, no
      // re-exports, no "temporary" local copies.
      expect(src).not.toMatch(/^function (Rail|DirectoryRail|ValidatorsRail)\b/m);
      // The rail's two signature marks. Deliberately NOT the 1560px width:
      // the filter strips on /directory and /validators share it and are
      // not rails, so asserting on width would fail for the wrong reason.
      expect(src).not.toContain("border-b border-dashed border-bcc-border");
      expect(src).not.toContain("bcc-rail-dot");
    });

    it("passes the kicker its deleted rail rendered", () => {
      expect(src).toContain(`kicker={"${escaped(site.kicker)}"}`);
    });

    it("passes the label its deleted rail rendered", () => {
      if (site.label !== null) {
        expect(src).toContain(`label={"${escaped(site.label)}"}`);
      }
      for (const raw of site.rawLabels ?? []) expect(src).toContain(raw);
    });

    it("spells non-breaking spaces as an escape, not a raw character", () => {
      // JSX attribute strings do not process backslash escapes, which is
      // why these are expression containers. A raw U+00A0 would render the
      // same and be invisible in review — this keeps it legible.
      expect(src).not.toContain(NBSP);
    });
  });
}

describe("the extraction is complete", () => {
  it("no rail markup survives outside RouteRail and FileRail", () => {
    const offenders = CALL_SITES.filter((s) => read(s.file).includes("bcc-rail-dot")).map((s) => s.route);
    expect(offenders).toEqual([]);
  });

  it("all seven routes render through the one component", () => {
    const count = CALL_SITES.filter((s) => read(s.file).includes("<RouteRail")).length;
    expect(count).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. FileRail — repaired, and still its own component
// ─────────────────────────────────────────────────────────────────────────

describe("FileRail — the other rail, fixed but not merged", () => {
  const SRC = read(FILE_RAIL);

  it("its right-hand metadata is secondary, matching its left half", () => {
    expect(SRC).toContain(
      '<span className="bcc-mono inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-bcc-text-secondary">',
    );
    expect(SRC).toContain(
      '<span className="bcc-mono inline-flex items-center gap-2 text-bcc-text-secondary">',
    );
    expect(SRC).not.toContain("text-bcc-text-muted");
  });

  it("keeps its own geometry — it was not quietly aligned to RouteRail", () => {
    // 1440 + responsive padding is correct for profile-style detail pages.
    // If these ever converge it should be a decision, not a drift.
    expect(SRC).toContain("max-w-[1440px]");
    expect(SRC).toContain("px-4 py-3 sm:px-7");
    expect(SRC).not.toContain("max-w-[1560px]");
  });

  it("neither imports the other — they are siblings, not a hierarchy", () => {
    // Compared as imports, not raw text: RouteRail's header documents the
    // difference between them at length, which is the point.
    expect(code(SRC)).not.toContain("RouteRail");
    expect(code(read(ROUTE_RAIL))).not.toContain("FileRail");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. List and conversation metadata — still authored in the pages
// ─────────────────────────────────────────────────────────────────────────

const METADATA: ReadonlyArray<readonly [string, string, string]> = [
  ["/members VERIFICATIONS column head", MEMBERS, "VERIFICATIONS"],
  ["/directory SHOWING ALL", DIRECTORY, ">SHOWING ALL<"],
  ["/validators SHOWING ALL", VALIDATORS, ">SHOWING ALL<"],
  ["/messages queued explainer", MESSAGES, "Messages you&apos;ve sent to validators"],
  ["/messages/new recipient @handle", MESSAGES_NEW, "@{recipient.handle}"],
  ["/messages/new result @handle", MESSAGES_NEW, "@{m.handle}"],
  ["/messages/[id] GROUP · N PARTICIPANTS", MESSAGES_ID, "PARTICIPANTS"],
];

describe("E2 — list and conversation metadata", () => {
  for (const [label, file, anchor] of METADATA) {
    it(`${label} uses --bcc-text-secondary`, () => {
      const line = colourLineFor(file, anchor);
      expect(line).toContain("text-bcc-text-secondary");
      expect(line).not.toContain("text-bcc-text-muted");
    });
  }

  it("the /messages/new character counter is secondary below the limit and safety above it", () => {
    // A ternary, not a static className: the counter turns `text-safety`
    // once the body exceeds the maximum. Only the under-limit branch was
    // muted; the over-limit branch is a real error state, left as authored.
    const src = read(MESSAGES_NEW).replace(/\r\n/g, "\n");
    expect(src).toContain(
      '(body.length > MESSAGE_BODY_MAX_LENGTH\n                    ? "text-safety"\n                    : "text-bcc-text-secondary")',
    );
    expect(src).not.toContain('"text-bcc-text-muted")');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. The /messages tab ladder
// ─────────────────────────────────────────────────────────────────────────

describe("E2 — the /messages tab ladder keeps a visible hover step", () => {
  // These are `<Link aria-current="page">` — navigation, not a tablist —
  // so they are NOT `.bcc-tab` and E1c's indicator rules do not reach them.
  // The rest state was muted with `hover:text-bcc-text-secondary`, the E1b
  // hover-collision shape: lifting rest alone would make hover a no-op.
  const src = read(MESSAGES);

  it("the resting rung is secondary", () => {
    expect(src).toContain('const off = "border-transparent text-bcc-text-secondary hover:text-bcc-text"');
  });

  it("the hover rung is --bcc-text, so the affordance survives", () => {
    const off = /const off = "([^"]+)"/.exec(src)?.[1] ?? "";
    expect(off).toContain("hover:text-bcc-text");
    expect(off).not.toContain("hover:text-bcc-text-secondary");
    expect(off).not.toContain("text-bcc-text-muted");
  });

  it("the selected rung is unchanged — E2 did not touch the active state", () => {
    expect(src).toContain('const on = "border-bcc-border-strong text-bcc-text"');
  });

  it("rest and hover are still different colours", () => {
    const off = /const off = "([^"]+)"/.exec(src)?.[1] ?? "";
    const rest = off.split(/\s+/).find((c) => c.startsWith("text-bcc-"));
    const hover = off.split(/\s+/).find((c) => c.startsWith("hover:text-bcc-"));
    expect(rest).toBe("text-bcc-text-secondary");
    expect(hover).toBe("hover:text-bcc-text");
    expect(`hover:${rest ?? ""}`).not.toBe(hover);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. The six deliberate exclusions
// ─────────────────────────────────────────────────────────────────────────

describe("E2 — disabled pagers stay muted, and stay distinguishable", () => {
  for (const [label, file] of [
    ["/communities", COMMUNITIES],
    ["/halls", HALLS],
  ] as const) {
    it(`${label}: the inactive branch is muted and the live branch is secondary`, () => {
      const src = read(file);
      expect(src).toContain('<span className="bcc-mono text-bcc-text-muted">← Previous</span>');
      expect(src).toContain('<span className="bcc-mono text-bcc-text-muted">Next →</span>');
      const links = [...src.matchAll(/className="bcc-mono text-bcc-text-secondary hover:underline"/g)];
      expect(links).toHaveLength(2);
    });
  }
});

describe("E2 — decorative chip glyphs stay muted", () => {
  for (const [label, file] of [
    ["/directory", DIRECTORY],
    ["/validators", VALIDATORS],
  ] as const) {
    it(`${label}: the aria-hidden ✕ is not promoted to text`, () => {
      expect(read(file)).toContain('<span aria-hidden className="text-bcc-text-muted">✕</span>');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Set equality over the whole file set
// ─────────────────────────────────────────────────────────────────────────

describe("E2 — no unaccounted muted text remains in the E2 file set", () => {
  it("the surviving muted sites are exactly the six exclusions", () => {
    const found: string[] = [];
    for (const file of FILE_SET) {
      read(file)
        .split(/\r?\n/)
        .forEach((line) => {
          if (line.includes("text-bcc-text-muted")) {
            found.push(`${file.replace(`${APP}/`, "")} :: ${line.trim()}`);
          }
        });
    }
    expect([...found].sort()).toEqual(
      [
        'communities/page.tsx :: <span className="bcc-mono text-bcc-text-muted">← Previous</span>',
        'communities/page.tsx :: <span className="bcc-mono text-bcc-text-muted">Next →</span>',
        'directory/page.tsx :: <span aria-hidden className="text-bcc-text-muted">✕</span>',
        'halls/page.tsx :: <span className="bcc-mono text-bcc-text-muted">← Previous</span>',
        'halls/page.tsx :: <span className="bcc-mono text-bcc-text-muted">Next →</span>',
        'validators/page.tsx :: <span aria-hidden className="text-bcc-text-muted">✕</span>',
      ].sort(),
    );
  });

  it("no file in the set uses the .bcc-text-muted utility either", () => {
    for (const file of FILE_SET) {
      const hits = [...read(file).matchAll(/(?<!text-)\bbcc-text-muted\b/g)];
      expect(hits, `${file} uses the .bcc-text-muted utility`).toHaveLength(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. The measurement the whole slice rests on
// ─────────────────────────────────────────────────────────────────────────

describe("E2 — secondary clears AA on the surfaces these routes render on", () => {
  const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");

  function token(name: string, nth: number): string {
    const all = [...CSS.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))];
    const v = all[nth]?.[1]?.trim();
    if (v === undefined) throw new Error(`token --${name}[${nth}] not found`);
    return v;
  }
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

  // index 0 = light, 1 = dark (@media), 2 = [data-theme="dark"]
  for (const [label, nth] of [
    ["light", 0],
    ["dark", 1],
  ] as const) {
    it(`${label}: secondary clears 4.5:1 on the page background`, () => {
      expect(ratio(token("bcc-text-secondary", nth), token("bcc-bg", nth))).toBeGreaterThanOrEqual(4.5);
    });

    it(`${label}: muted would still have failed — this is why the set moved`, () => {
      // Not a test that muted "stays broken". It records why this slice
      // exists, and fails loudly if someone repairs the token instead,
      // which would make the migration redundant and worth revisiting.
      expect(ratio(token("bcc-text-muted", nth), token("bcc-bg", nth))).toBeLessThan(4.5);
    });
  }

  it("E2 changed no CSS — globals.css holds exactly E1's remaining exclusions", () => {
    // 8 -> 3 because the dead-CSS cleanup DELETED the five zero-consumer
    // rules E1 had pinned. No E2 site changed; the denominator did.
    expect([...CSS.matchAll(/var\(--bcc-text-muted\)/g)]).toHaveLength(3);
  });
});
