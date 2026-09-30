/**
 * Accessibility, touch targets, and colour-token discipline.
 *
 * Two kinds of assertion live here:
 *
 *  - **Rendered** — roles, labels and live regions on the real DOM.
 *  - **Source-scanned** — the repo's established idiom (see
 *    `weld-confinement.test.ts`, `undeclared-custom-property.test.ts`)
 *    for rules a rendered test cannot see, because jsdom has no layout
 *    and Tailwind classes are strings until build time.
 *
 * The token scan matters here specifically because this slice adds a
 * whole new component directory that mixes BOTH surface families —
 * theme-aware chrome in the composer dialog, fixed cream/ink paper in
 * the panels — and crossing them is the single most repeated bug in
 * this codebase.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => <div /> }));

const listAnnouncements = vi.fn();
const listAnnouncementComments = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listAnnouncements: (...a: unknown[]) => listAnnouncements(...a),
  listAnnouncementComments: (...a: unknown[]) => listAnnouncementComments(...a),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  setAnnouncementPin: vi.fn(),
  getAnnouncementAsClient: vi.fn(),
  createAnnouncementComment: vi.fn(),
  removeAnnouncementComment: vi.fn(),
}));

const { AnnouncementsPanel } = await import(
  "@/components/announcements/AnnouncementsPanel"
);
const { AnnouncementComments } = await import(
  "@/components/announcements/AnnouncementComments"
);
const { EntityTabs } = await import("@/components/entity/EntityTabs");
const {
  OWNER_CAPABILITIES,
  PUBLISHED_ANNOUNCEMENT,
  LIVE_COMMENT,
  announcementListResponse,
  commentsResponse,
} = await import("@/lib/announcements/fixtures");

const COMPONENT_DIR = join(process.cwd(), "src", "components", "announcements");

function sourceFiles(): Array<{ name: string; text: string }> {
  return readdirSync(COMPONENT_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .map((name) => ({ name, text: readFileSync(join(COMPONENT_DIR, name), "utf8") }));
}

let client: QueryClient;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  listAnnouncements.mockImplementation((params: unknown) =>
    Promise.resolve(
      (params as { state?: string }).state === "archived"
        ? announcementListResponse([])
        : announcementListResponse([PUBLISHED_ANNOUNCEMENT]),
    ),
  );
  listAnnouncementComments.mockResolvedValue(commentsResponse([LIVE_COMMENT]));
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe("the source scan actually sees the components", () => {
  /**
   * A scan over zero files passes vacuously. Pin a floor so deleting or
   * renaming the directory fails loudly instead of going quiet.
   */
  it("finds every announcement component", () => {
    const names = sourceFiles().map((f) => f.name).sort();
    expect(names).toEqual([
      "AnnouncementComments.tsx",
      "AnnouncementComposer.tsx",
      "AnnouncementDetailView.tsx",
      "AnnouncementListItem.tsx",
      "AnnouncementsPanel.tsx",
    ]);
  });
});

describe("colour-token discipline", () => {
  it("uses no raw hex colours", () => {
    for (const { name, text } of sourceFiles()) {
      const hits = text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hits, `${name} contains raw hex ${hits.join(", ")}`).toEqual([]);
    }
  });

  it("uses no rgb()/hsl() literals", () => {
    for (const { name, text } of sourceFiles()) {
      expect(text, `${name} contains a raw colour function`).not.toMatch(
        /\b(rgb|rgba|hsl|hsla)\(\s*\d/,
      );
    }
  });

  it("uses no named Tailwind palette classes", () => {
    // e.g. text-red-500 / bg-slate-200 — the palette the doctrine bans
    // in favour of --bcc-* tokens.
    const palette =
      /\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    for (const { name, text } of sourceFiles()) {
      expect(text, `${name} uses a named Tailwind palette class`).not.toMatch(palette);
    }
  });

  it("uses no bare text-white / bg-black", () => {
    for (const { name, text } of sourceFiles()) {
      expect(text, `${name} uses a raw black/white utility`).not.toMatch(
        /\b(?:text|bg)-(?:white|black)\b/,
      );
    }
  });

  /**
   * `--bcc-text-muted` measures 2.54:1 light / 2.28:1 dark — it fails AA
   * as text on every surface, and the repo-wide E6 closure guard permits
   * it only on disabled controls and `aria-hidden` decoration. Nothing
   * this slice renders is either, so the whole directory abstains.
   *
   * The E6 guard already catches a violation repo-wide; this states the
   * local rule so a future edit here fails next to the code that broke
   * it rather than in a distant closure test. (It caught two real
   * help-text violations in the composer during this slice.)
   */
  it("never uses the AA-failing muted text token", () => {
    for (const { name, text } of sourceFiles()) {
      expect(text, `${name} uses --bcc-text-muted on readable text`).not.toMatch(
        /\btext-bcc-text-muted\b/,
      );
    }
  });

  /**
   * `text-warning` compiles to nothing — the utility is `text-bcc-warning`.
   * It has bitten this codebase before, so it is pinned rather than trusted.
   */
  it("never uses the non-existent text-warning utility", () => {
    for (const { name, text } of sourceFiles()) {
      expect(text, `${name} uses text-warning, which emits no CSS`).not.toMatch(
        /\btext-warning\b/,
      );
    }
  });
});

describe("touch targets", () => {
  /**
   * 44×44 for primary controls. The 36px compact exception is for dense
   * repeated chrome (filter chips, pager chips) and does not apply to
   * anything this slice adds.
   */
  it("declares a 44px minimum on every interactive control", () => {
    let scanned = 0;
    for (const { name, text } of sourceFiles()) {
      // Split rather than regex the open tag: an `onClick={() => …}` prop
      // contains `>`, so a non-greedy `<button[\s\S]*?>` truncates at the
      // arrow and reads as a button with no attributes. Each chunk is
      // scanned up to its closing tag instead.
      for (const chunk of text.split("<button").slice(1)) {
        const end = chunk.indexOf("</button>");
        const region = end === -1 ? chunk : chunk.slice(0, end);
        scanned += 1;
        expect(
          region.includes('minHeight: "44px"') || region.includes("min-h-[44px]"),
          `a <button> in ${name} declares no 44px minimum: ${region.slice(0, 120)}`,
        ).toBe(true);
      }
    }
    // A scan over zero buttons passes vacuously. This slice ships nine;
    // the floor turns "the regex stopped matching" into a failure rather
    // than a silent green.
    expect(scanned, "the button scan matched nothing").toBeGreaterThanOrEqual(8);
  });
});

describe("mobile structure at 375px", () => {
  /**
   * jsdom has no layout, so overflow cannot be measured here — the real
   * check is the 375px screenshot. What IS checkable is that nothing
   * declares a fixed width wider than the 375px target minus gutters,
   * which is how an overflow gets introduced in the first place.
   */
  it("declares no fixed width that cannot fit a 375px viewport", () => {
    for (const { name, text } of sourceFiles()) {
      const widths = text.match(/width:\s*"(\d+)px"/g) ?? [];
      for (const decl of widths) {
        const px = Number(decl.match(/(\d+)/)?.[1] ?? 0);
        expect(px, `${name} declares a ${px}px fixed width`).toBeLessThanOrEqual(343);
      }
      expect(text, `${name} uses a hard min-w that overflows a phone`).not.toMatch(
        /min-w-\[(?:[4-9]\d{2}|\d{4,})px\]/,
      );
    }
  });

  it("pairs every horizontal padding with a mobile-first smaller value", () => {
    // `px-5 sm:px-8` — never an UNPREFIXED `px-8`, which crowds 375px.
    // The lookbehind is what makes this honest: without it the pattern
    // matches the `px-8` inside `sm:px-8` and fails on correct code.
    const unprefixedLargePadding = /(?<![\w:-])px-8\b/;
    for (const { name, text } of sourceFiles()) {
      expect(text, `${name} applies px-8 with no smaller mobile value`).not.toMatch(
        unprefixedLargePadding,
      );
    }
  });
});

describe("rendered accessibility", () => {
  it("gives the tab strip tab semantics and a live panel", () => {
    render(
      <EntityTabs
        backingPanel={<div />}
        reviewsPanel={<div />}
        activityPanel={<div />}
        watchersPanel={<div />}
        announcementsPanel={<div>panel</div>}
      />,
    );
    const tab = screen.getByRole("tab", { name: "Announcements" });
    expect(tab).toHaveAttribute("aria-selected");
    expect(tab).toHaveAttribute("aria-controls");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-live", "polite");
  });

  it("labels the comment composer for screen readers", async () => {
    render(
      <QueryClientProvider client={client}>
        <AnnouncementComments announcementId="ann_4471" viewerAuthed />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Add a comment")).toBeInTheDocument();
    });
  });

  it("names the discussion region from its own heading", async () => {
    render(
      <QueryClientProvider client={client}>
        <AnnouncementComments announcementId="ann_4471" viewerAuthed />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Discussion" })).toBeInTheDocument();
    });
  });

  it("gives the panel a real heading rather than styled text", async () => {
    render(
      <QueryClientProvider client={client}>
        <AnnouncementsPanel
          pageId={1842}
          validatorName="Blacksmith Node"
          capabilities={OWNER_CAPABILITIES}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Announcements" }),
      ).toBeInTheDocument();
    });
  });
});
