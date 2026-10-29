/**
 * The billboard says what it is showing, and says it legibly.
 *
 * ## What this pins
 *
 * Four findings from a measured review of F1/F2 against representative
 * fixtures (7 announcements, server-pinned row first, rotator capped at 5):
 *
 *   1. CONTRAST. The row title's colour is set on the inner `<a>`, which
 *      carried no class and inherited the global theme link colour —
 *      measured 2.08:1 on the cream paper surface, under the 3:1 bar for
 *      22px/800 text. `PINNED` and `READ MORE` used the theme accent on
 *      the same surface: 2.95:1, under 4.5:1. The bar's own kicker used it
 *      on white: 3.39:1, under 4.5:1.
 *   2. The bar — the billboard, the one place pinning matters most — did
 *      not say an announcement was pinned. The tab already did.
 *   3. There was no visible position: "1 of 5" existed only in the
 *      screen-reader live region, so sighted viewers got three buttons and
 *      no sense of how many.
 *   4. Controls were text glyphs, which depend on font fallback.
 *
 * ## The controls that matter
 *
 * The live region is deliberately silent during automatic rotation and
 * polite only for a viewer-initiated change. A visible position indicator
 * is exactly the kind of addition that quietly turns into a SECOND
 * announcement, so it is asserted to be `aria-hidden` and the live
 * region's own behaviour is re-asserted here unchanged.
 *
 * Server ordering is the server's. The bar reports the flag on whichever
 * row it was handed; it never sorts, so a test feeds a pinned row that is
 * NOT first and asserts the order is untouched.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const state = vi.hoisted(() => ({ rotator: null as unknown }));

vi.mock("@/hooks/useAnnouncements", () => ({
  useAnnouncementRotator: () => state.rotator,
  announcementRotatorQueryKey: (id: number) => ["announcements", id, "rotator"],
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

import { AnnouncementBar } from "@/components/announcements/AnnouncementBar";

function ann(i: number, over: Record<string, unknown> = {}) {
  return {
    id: "ann_" + i,
    title: "Announcement " + i,
    summary: "Summary " + i,
    published_at: "2026-10-1" + (i % 10) + "T12:00:00Z",
    updated_at: null,
    is_pinned: false,
    is_archived: false,
    archived_at: null,
    comment_count: 0,
    comments_enabled: true,
    links: { self: "/v/node/a/ann_" + i },
    ...over,
  };
}

const ok = (items: unknown[]) => ({
  data: { items, pagination: { page: 1, per_page: 20, total: items.length, total_pages: 1 } },
  isPending: false,
  isError: false,
  isSuccess: true,
  error: null,
});

beforeEach(() => {
  state.rotator = ok([ann(1, { is_pinned: true }), ann(2), ann(3)]);
  // The bar reads matchMedia directly inside its interval effect (the
  // documented workaround for the post-mount resolve), so jsdom needs it.
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

afterEach(cleanup);

const bar = () => screen.getByTestId("announcement-bar");
const controls = () => screen.queryByTestId("announcement-bar-controls");
const position = () => screen.queryByTestId("announcement-bar-position");
const status = () => screen.getByTestId("announcement-bar-status");

function mount(pageId = 1842) {
  return render(<AnnouncementBar pageId={pageId} featureEnabled />);
}

describe("the pinned state is visible on the billboard", () => {
  it("marks a pinned announcement", () => {
    mount();
    expect(screen.queryByTestId("announcement-bar-pinned")).not.toBeNull();
    expect(within(bar()).getByText(/PINNED/)).toBeTruthy();
  });

  it("says nothing when the showing announcement is not pinned", () => {
    state.rotator = ok([ann(1), ann(2)]);
    mount();
    expect(screen.queryByTestId("announcement-bar-pinned")).toBeNull();
  });

  it("does not convey pinned by colour alone", () => {
    // There is a word, not just a tint — the icon sits beside it.
    mount();
    const pin = screen.getByTestId("announcement-bar-pinned");
    expect((pin.textContent ?? "").trim()).toMatch(/PINNED/);
    expect(pin.querySelector("svg")).not.toBeNull();
  });

  it("reports the flag on the row it was handed, and never reorders", () => {
    // The server owns the order (pinned first, then newest). A pinned row
    // arriving second must NOT be hoisted — the first row still shows.
    state.rotator = ok([ann(1), ann(2, { is_pinned: true })]);
    mount();
    expect(within(bar()).getByText("Announcement 1")).toBeTruthy();
    expect(screen.queryByTestId("announcement-bar-pinned")).toBeNull();
  });
});

describe("the position is visible, and silent", () => {
  it("shows which of how many", () => {
    mount();
    expect((position()?.textContent ?? "").replace(/\s+/g, "")).toBe("1/3");
  });

  it("advances with the viewer's own navigation", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /next announcement/i }));
    expect((position()?.textContent ?? "").replace(/\s+/g, "")).toBe("2/3");
  });

  it("is HIDDEN from assistive technology, so it adds no second announcement", () => {
    // The live region already carries this fact. Two nodes saying it is
    // one more thing spoken, not one more thing understood.
    mount();
    expect(position()).toHaveAttribute("aria-hidden");
  });

  it("is absent when there is nothing to page through", () => {
    state.rotator = ok([ann(1)]);
    mount();
    expect(position()).toBeNull();
    expect(controls()).toBeNull();
  });
});

describe("the live region is unchanged", () => {
  it("stays silent during automatic rotation", () => {
    mount();
    expect(status()).toHaveAttribute("data-live", "off");
  });

  it("becomes polite only for a change the viewer asked for", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /next announcement/i }));
    expect(status()).toHaveAttribute("data-live", "polite");
  });

  it("still carries the position and title for screen readers", () => {
    mount();
    expect(status().textContent).toMatch(/Announcement 1 of 3/);
  });
});

describe("controls are icons, and still named", () => {
  it("renders SVG rather than text glyphs", () => {
    mount();
    for (const name of [/previous announcement/i, /next announcement/i, /pause rotation/i]) {
      const btn = screen.getByRole("button", { name });
      expect(btn.querySelector("svg")).not.toBeNull();
      // A glyph would leave text behind; an icon leaves the name on the
      // button, which is what assistive technology reads.
      expect((btn.textContent ?? "").trim()).toBe("");
    }
  });

  it("keeps every accessible name", () => {
    mount();
    expect(screen.getByRole("button", { name: /previous announcement/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /next announcement/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /pause rotation/i })).toBeTruthy();
  });

  it("still toggles the pause control, name and pressed state together", () => {
    mount();
    const pause = screen.getByRole("button", { name: /pause rotation/i });
    expect(pause).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pause);
    const resume = screen.getByRole("button", { name: /resume rotation/i });
    expect(resume).toHaveAttribute("aria-pressed", "true");
    expect(resume.querySelector("svg")).not.toBeNull();
  });
});

describe("the capability gate is untouched", () => {
  it("renders nothing when the feature is not enabled", () => {
    const { container } = render(<AnnouncementBar pageId={1842} featureEnabled={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the rotator is empty", () => {
    state.rotator = ok([]);
    const { container } = mount();
    expect(container.firstChild).toBeNull();
  });
});
