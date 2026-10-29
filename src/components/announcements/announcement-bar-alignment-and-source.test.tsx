/**
 * The two operator-approved billboard improvements, pinned.
 *
 * Both came out of a clarity review whose dominant question was: can a
 * visitor immediately find the validator's important update, understand who
 * issued it, and open the full notice.
 *
 * D1 — DESKTOP ALIGNMENT. The bar was `max-w-3xl` centred between a hero and
 * a tab strip that both sit in `max-w-[1440px] px-4 sm:px-7`, which put its
 * content 281px in from the page's own scan line at 1280px. Readers scan the
 * left margin, so a centred island between two left-aligned blocks is the
 * easiest thing on the page to skip — and the thing being skipped was the
 * operator's most important notice.
 *
 * D2 — OPERATOR SOURCE. The billboard carried a category ("ANNOUNCEMENT")
 * and no issuer, on a page that also hosts platform-authored judgements
 * about the same operator.
 *
 * The alignment case compares the bar's container against EntityProfile's
 * OWN tab-section container, read from source. Hard-coding the expected
 * class string would pass happily if someone later changed the tabs and left
 * the bar behind — which is the exact regression D1 fixes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Announcement } from "@/lib/api/types";
import type * as AnnouncementEndpoints from "@/lib/api/announcement-endpoints";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "9001", handle: "fixture-a" } },
    status: "authenticated",
  }),
  getSession: async () => ({ user: { id: "9001", handle: "fixture-a" } }),
  signOut: vi.fn(async () => undefined),
}));

const getAnnouncementRotator = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", async (orig) => {
  const actual = await orig<typeof AnnouncementEndpoints>();
  return {
    ...actual,
    getAnnouncementRotator: (...a: unknown[]) => getAnnouncementRotator(...a),
  };
});

const { AnnouncementBar } = await import("@/components/announcements/AnnouncementBar");
const { SECOND_ANNOUNCEMENT, announcementListResponse } = await import(
  "@/lib/announcements/fixtures"
);

const SRC_DIR = join(process.cwd(), "src", "components", "announcements");
const BAR_SRC = readFileSync(join(SRC_DIR, "AnnouncementBar.tsx"), "utf8");
const PROFILE_SRC = readFileSync(
  join(process.cwd(), "src", "components", "entity", "EntityProfile.tsx"),
  "utf8",
);

/** The approved string, exactly. */
const SOURCE_LABEL = "Update from the validator operator.";

let client: QueryClient;

function makeItem(id: string, title: string, pinned = false): Announcement {
  return {
    ...SECOND_ANNOUNCEMENT,
    id,
    title,
    summary: `${title} summary`,
    is_pinned: pinned,
    links: { self: `/v/fixture-validator/a/${id}` },
  };
}

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
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  getAnnouncementRotator.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

function mount() {
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementBar pageId={35} featureEnabled />
    </QueryClientProvider>,
  );
}

describe("D1 — the billboard shares the page's container", () => {
  /** The container the tab strip actually uses, read from EntityProfile. */
  function tabsContainerClasses(): string {
    const m = PROFILE_SRC.match(
      /<section className="(mx-auto mt-\d+ max-w-\[[^\]]+\][^"]*)">\s*\n\s*<EntityTabs/,
    );
    expect(m, "could not find EntityTabs' own section in EntityProfile").not.toBeNull();
    return m![1]!;
  }

  it("uses the SAME max-width and horizontal padding as the tab strip", () => {
    const tabs = tabsContainerClasses();
    const maxW = tabs.match(/max-w-\[[^\]]+\]/)![0];
    const padding = tabs.match(/px-\d+(?:\s+sm:px-\d+)?/)![0];

    // Both are compared against the tabs' own declaration, so changing the
    // tabs without changing the bar fails here rather than silently
    // re-opening the indent.
    expect(BAR_SRC, `bar must use the tab strip's ${maxW}`).toContain(maxW);
    expect(BAR_SRC, `bar must use the tab strip's ${padding}`).toContain(padding);
  });

  it("no longer centres itself in a narrower container", () => {
    // `max-w-3xl` is still PRESENT in the file, but only as the inner text
    // measure. What must be gone is the old OUTER container pairing.
    expect(BAR_SRC).not.toContain("max-w-3xl px-4 sm:px-0");
  });

  it("applies the shared container to every branch, not just the loaded one", () => {
    // The bar has three returns — loading, empty/failed and loaded. The
    // review measured the loaded one; an unaligned skeleton would still
    // shift the page as it resolved.
    const outer = BAR_SRC.match(/mx-auto mt-8 max-w-\[1440px\] px-4 sm:px-7/g) ?? [];
    expect(outer.length).toBe(3);
  });

  it("keeps a readable text measure inside the wide card", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("ann_1", "Upgrade to v18 complete", true)]),
    );
    mount();
    const slide = await screen.findByTestId("announcement-slide");
    // Left-aligned, NOT `mx-auto`: the text starts at the card's own inset so
    // it lines up with the hero and the tabs, while a 300-character summary
    // still wraps at a readable width instead of running to 1440px.
    expect(slide.className).toContain("max-w-3xl");
    expect(slide.className).not.toContain("mx-auto");
  });
});

describe("D2 — the billboard says who is speaking", () => {
  beforeEach(() => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("ann_1", "Upgrade to v18 complete", true)]),
    );
  });

  it("renders the approved copy verbatim", async () => {
    mount();
    expect(await screen.findByTestId("announcement-bar-source")).toHaveTextContent(
      SOURCE_LABEL,
    );
  });

  it("claims authorship without claiming endorsement or verification", async () => {
    mount();
    const label = await screen.findByTestId("announcement-bar-source");
    const text = label.textContent ?? "";

    // Constraint 1: no implied BCC endorsement.
    for (const word of ["BCC", "Blue Collar", "endorse", "approved", "official"]) {
      expect(text.toLowerCase()).not.toContain(word.toLowerCase());
    }
    // Constraint 2: not a new identity-verification claim. The frontend
    // verifies nothing here — the server decides who may publish.
    for (const word of ["verified", "confirmed", "authentic", "trusted"]) {
      expect(text.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it("is plain text, not a badge that would read as a verification marker", async () => {
    mount();
    const label = await screen.findByTestId("announcement-bar-source");
    expect(label.tagName).toBe("P");
    // No pill/chip affordances — those are what make a label look like a
    // trust marker rather than a byline.
    expect(label.className).not.toMatch(/\brounded\b|\bborder\b|\bbg-/);
  });

  it("sits OUTSIDE the live region, so rotation does not re-announce it", async () => {
    mount();
    const label = await screen.findByTestId("announcement-bar-source");
    const status = screen.getByTestId("announcement-bar-status");

    expect(status.contains(label)).toBe(false);
    // The live region still carries only the position sentence.
    expect(status).toHaveTextContent(/^Announcement 1 of 1:/);
    expect(status.textContent).not.toContain(SOURCE_LABEL);
  });

  it("appears once per rendered slide, above the title", async () => {
    mount();
    await screen.findByTestId("announcement-slide");
    expect(screen.getAllByTestId("announcement-bar-source")).toHaveLength(1);

    const slide = screen.getByTestId("announcement-slide");
    const label = screen.getByTestId("announcement-bar-source");
    const heading = screen.getByRole("heading", { level: 3 });
    // DOCUMENT_POSITION_FOLLOWING === 4: the heading follows the label.
    expect(label.compareDocumentPosition(heading) & 4).toBeTruthy();
    expect(slide.contains(label)).toBe(true);
  });

  it("does not disturb the contrast work the billboard already shipped", async () => {
    mount();
    const label = await screen.findByTestId("announcement-bar-source");
    // Secondary ink on the panel surface — the same token the ANNOUNCEMENT
    // eyebrow uses, which the review measured at 7.56:1. NOT `text-safety`,
    // which measured 3.39:1 here and is what that fix removed.
    expect(label.className).toContain("text-bcc-text-secondary");
    expect(label.className).not.toContain("text-safety");
  });

  it("renders for a non-pinned announcement too", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([makeItem("ann_2", "Routine maintenance", false)]),
    );
    mount();
    await waitFor(() =>
      expect(screen.getByTestId("announcement-bar-source")).toHaveTextContent(SOURCE_LABEL),
    );
    // The source is a property of the bar, not of the pin.
    expect(screen.queryByTestId("announcement-bar-pinned")).toBeNull();
  });
});
