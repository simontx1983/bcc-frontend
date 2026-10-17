/**
 * The announcement row stays inside the paper palette.
 *
 * ## What this pins
 *
 * This row renders on surface family B — fixed cream/ink paper — and its
 * own docblock already says text tokens here are `text-ink*` and never the
 * theme-aware ones. Two places crossed it anyway, both measured in a
 * browser against the real surface:
 *
 *   title      the colour is set on the inner <a>, which carried no class
 *              and inherited the global theme link colour.  2.08:1
 *              (22px/800 needs 3:1)
 *   PINNED     theme accent on cream.                        2.95:1
 *   READ MORE  theme accent on cream.                        2.95:1
 *
 * `text-ink` on the same surface measures 16.92:1, `text-ink-ghost` 5.17:1.
 *
 * ## Why these are class assertions
 *
 * jsdom computes no colours from Tailwind utilities, so a contrast number
 * cannot be derived here. The browser measurements above are the evidence;
 * these cases pin the class contract that produces them — the same shape
 * as the existing token-discipline scan in this folder, which catches raw
 * hex but cannot catch a theme-family utility on a paper surface.
 *
 * The sweep at the end is the part that generalises: no element in the
 * rendered row may carry the theme accent, so a future addition inherits
 * the rule without anyone remembering it.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

import { AnnouncementListItem } from "@/components/announcements/AnnouncementListItem";

function ann(over: Record<string, unknown> = {}) {
  return {
    id: "ann_1",
    title: "Upgrade to v18 complete",
    summary: "Operator-written one-liner.",
    published_at: "2026-10-12T12:00:00Z",
    updated_at: null,
    is_pinned: false,
    is_archived: false,
    archived_at: null,
    comment_count: 3,
    comments_enabled: true,
    links: { self: "/v/node/a/ann_1" },
    ...over,
  };
}

afterEach(cleanup);

const row = () => screen.getByTestId("announcement-row");

describe("the title is readable on paper", () => {
  it("colours the LINK, not just the heading around it", () => {
    // The heading's own `text-ink` never reached the text: colour is set
    // on the <a>, and an unclassed <a> takes the global theme link colour.
    render(<AnnouncementListItem announcement={ann()} />);
    const link = within(row()).getByRole("link", { name: /Upgrade to v18/ });
    expect(link.className).toContain("text-ink");
  });

  it("keeps the hover affordance", () => {
    render(<AnnouncementListItem announcement={ann()} />);
    const link = within(row()).getByRole("link", { name: /Upgrade to v18/ });
    expect(link.className).toContain("hover:underline");
  });
});

describe("PINNED is readable, and not colour alone", () => {
  it("uses the paper family's own ink", () => {
    render(<AnnouncementListItem announcement={ann({ is_pinned: true })} />);
    const pinned = screen.getByTestId("announcement-row-pinned");
    expect(pinned.className).toContain("text-ink");
    expect(pinned.className).not.toContain("text-safety");
  });

  it("carries an icon beside the word", () => {
    render(<AnnouncementListItem announcement={ann({ is_pinned: true })} />);
    const pinned = screen.getByTestId("announcement-row-pinned");
    expect((pinned.textContent ?? "").trim()).toMatch(/PINNED/);
    expect(pinned.querySelector("svg")).not.toBeNull();
  });

  it("is absent on an unpinned row", () => {
    render(<AnnouncementListItem announcement={ann()} />);
    expect(screen.queryByTestId("announcement-row-pinned")).toBeNull();
  });

  it("is absent on an archived row, pinned or not", () => {
    render(
      <AnnouncementListItem
        announcement={ann({ is_pinned: true, is_archived: true, archived_at: "2026-10-02T09:00:00Z" })}
      />,
    );
    expect(screen.queryByTestId("announcement-row-pinned")).toBeNull();
    expect(screen.getByTestId("announcement-archived-flag")).toBeTruthy();
  });
});

describe("READ MORE is readable", () => {
  it("uses ink rather than the theme accent", () => {
    render(<AnnouncementListItem announcement={ann()} />);
    const cta = within(row()).getByRole("link", { name: /READ MORE/i });
    expect(cta.className).toContain("text-ink");
    expect(cta.className).not.toContain("text-safety");
  });
});

describe("nothing in the row crosses into the theme palette", () => {
  // The generalising control: a future addition inherits the rule.
  it.each([
    ["plain", {}],
    ["pinned", { is_pinned: true }],
    ["archived", { is_archived: true, archived_at: "2026-10-02T09:00:00Z" }],
    ["no comments", { comment_count: 0 }],
  ])("%s row uses no theme-aware text token", (_label, over) => {
    render(<AnnouncementListItem announcement={ann(over)} />);
    const offenders: string[] = [];
    row()
      .querySelectorAll("*")
      .forEach((el) => {
        const cls = el.className;
        if (typeof cls !== "string") return;
        for (const bad of ["text-safety", "text-bcc-text", "text-bcc-primary", "text-weld"]) {
          if (cls.split(/\s+/).includes(bad)) offenders.push(bad + " on " + el.tagName.toLowerCase());
        }
      });
    expect(offenders).toEqual([]);
  });
});
