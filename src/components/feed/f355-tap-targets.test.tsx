/**
 * F-355 — touch-target follow-ups to the Handoff v1 post card + bottom bar.
 *
 * 1. Every pill in the post action row (Stoke, Helpful, Comment, Share)
 *    carries the shared 44×44 hit area, drawn as an invisible ::before so
 *    the 26px pill and its hover fill keep their size. jsdom does no
 *    layout, so this pins the mechanism (the shared class on each control
 *    and the row spacing that keeps the enlarged areas apart) rather than
 *    measuring pixels; the real geometry was measured in a browser.
 * 2. The fixed mobile bar grows by env(safe-area-inset-bottom) and pads it
 *    out, the centre column clears the same total, and the viewport opts in
 *    to viewport-fit=cover — without which every inset reads as 0.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_BCC_API_URL: "https://wp.example" },
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "9001" } } }),
  getSession: async () => null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/composer/NewPostTrigger", () => ({
  NewPostTrigger: ({ ariaLabel }: { ariaLabel: string }) => <button type="button" aria-label={ariaLabel} />,
}));

import { HIT_AREA_44 } from "@/components/feed/hitArea";
import { PostActionBar } from "@/components/feed/PostActionBar";
import { MobileNav } from "@/components/layout/nav/MobileNav";
import type { FeedItem } from "@/lib/api/types";

afterEach(cleanup);

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

const item = {
  id: "f1",
  post_kind: "status",
  external_id: 205,
  posted_at: "2026-09-30T14:00:00Z",
  scope_tags: [],
  author: {
    user_id: 7,
    handle: "blacksmith-node",
    reputation_tier: "neutral",
    reputation_tier_label: "Neutral",
  },
  body: { text: "hello" },
  reactions: {
    kind_grammar: "social",
    counts: {},
    viewer_reaction: null,
    viewer_has_stoked: false,
    stoke_count: 3,
    heat_stage: 1,
  },
  helpful_count: 2,
  viewer_has_marked: false,
  comment_count: 4,
  permissions: {},
  links: { self: "/u/blacksmith-node/post/abc", author: "/u/blacksmith-node" },
} as unknown as FeedItem;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

describe("F-355 action-row hit areas", () => {
  it("the shared class is an invisible, centred, at-least-44px ::before", () => {
    for (const cls of [
      "relative",
      "before:absolute",
      "before:h-11",
      "before:w-[max(100%,2.75rem)]",
      "before:-translate-x-1/2",
      "before:-translate-y-1/2",
      "before:content-['']",
    ]) {
      expect(HIT_AREA_44.split(" ")).toContain(cls);
    }
    // Invisible: no fill, border or colour on the pseudo-element.
    expect(HIT_AREA_44).not.toMatch(/before:(bg|border|text|shadow)-/);
  });

  it("every pill in the row carries it, and the 26px body is unchanged", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <PostActionBar item={item} commentCount={4} onComment={() => {}} />
      </QueryClientProvider>,
    );
    const q = within(container);
    const controls = [
      q.getByLabelText("Stoke"),
      q.getByLabelText("Mark this as helpful"),
      q.getByLabelText("Comments"),
      q.getByLabelText("Share post"),
    ];
    for (const el of controls) {
      expect(el.className).toContain("before:h-11");
      expect(el.className).toContain("min-h-[26px]");
    }
  });

  it("the row spaces pills 12px apart so the enlarged areas don't overlap", () => {
    const qc = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <PostActionBar item={item} commentCount={4} onComment={() => {}} />
      </QueryClientProvider>,
    );
    const footer = container.querySelector("footer") as HTMLElement;
    expect(footer.className).toContain("gap-x-3");
    expect(footer.className).not.toMatch(/(^|\s)gap-1(\s|$)/);
  });
});

describe("F-355 safe-area inset on the mobile bar", () => {
  it("the bar grows by the bottom inset and pads it out", () => {
    // jsdom's CSSOM drops env() values from inline styles, so the
    // declarations are pinned in the source; the render proves the bar
    // still mounts as the fixed bottom nav.
    const src = read("src/components/layout/nav/MobileNav.tsx");
    expect(src).toContain('height: "var(--bcc-mobile-nav-total-h)"');
    expect(src).toContain('paddingBottom: "env(safe-area-inset-bottom, 0px)"');
    const { container } = render(<MobileNav onMenuOpen={() => undefined} />);
    const nav = container.querySelector('nav[aria-label="Mobile navigation"]') as HTMLElement;
    expect(nav.style.position).toBe("fixed");
    expect(nav.style.bottom).toBe("0px");
  });

  it("one var carries the bar's total height (body + home-indicator inset)", () => {
    expect(read("src/app/globals.css")).toContain(
      "--bcc-mobile-nav-total-h: calc(var(--bcc-mobile-nav-h) + env(safe-area-inset-bottom, 0px));",
    );
  });

  it("everything that clears the bar uses the total, never the bare 60px", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(".bcc-col-center { padding-bottom: var(--bcc-mobile-nav-total-h); }");
    expect(css).toContain("bottom: calc(var(--bcc-mobile-nav-total-h) + 16px);"); // resume FAB
    expect(css).toContain("bottom: calc(var(--bcc-mobile-nav-total-h) + 72px);"); // its tooltip
    expect(read("src/components/layout/nav/MobileNav.tsx")).toContain(
      'height: "var(--bcc-mobile-nav-total-h)"',
    );
    for (const f of [
      "src/components/analytics/AnalyticsConsentBanner.tsx",
      "src/components/admin/UndoToast.tsx",
      "src/components/auth/AuthRedirectNotice.tsx",
    ]) {
      expect(read(f), f).toContain("bottom-[calc(var(--bcc-mobile-nav-total-h)+16px)]");
    }
    // The bare token may only appear in its own definition and the total.
    const bare = [...css.matchAll(/var\(--bcc-mobile-nav-h\)/g)];
    expect(bare).toHaveLength(1);
  });

  it("cover's landscape side insets are cleared by the body, the header and the bar", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(
      "padding: 0 env(safe-area-inset-right, 0px) 0 env(safe-area-inset-left, 0px);",
    );
    expect(css).toContain(
      "padding: 0 calc(16px + env(safe-area-inset-right, 0px)) 0 calc(10px + env(safe-area-inset-left, 0px));",
    );
    expect(css).toContain(
      "padding: 0 calc(10px + env(safe-area-inset-right, 0px)) 0 calc(6px + env(safe-area-inset-left, 0px));",
    );
    const nav = read("src/components/layout/nav/MobileNav.tsx");
    expect(nav).toContain('paddingLeft: "env(safe-area-inset-left, 0px)"');
    expect(nav).toContain('paddingRight: "env(safe-area-inset-right, 0px)"');
  });

  it("the viewport opts in to viewport-fit=cover, or every inset is 0", () => {
    expect(read("src/app/layout.tsx")).toMatch(/viewportFit:\s*"cover"/);
  });
});
