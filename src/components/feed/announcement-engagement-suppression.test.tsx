/**
 * Announcements carry no engagement controls — contract §4.32.15.
 *
 * An announcement is an official information billboard on a validator
 * page, not a post competing for engagement. So the shared action bar
 * must render NO Stoke and NO Mark-helpful control for it, while every
 * other kind keeps both.
 *
 * ## Why each case here earns its place
 *
 * The suppression is keyed on `post_kind` and on NOTHING else, and that
 * is the property worth pinning. The server-side half of this decision
 * cannot be relied on:
 *
 *   - the normalizer emits `reactions ?? emptyReactionsFor($postKind)`,
 *     and an UNREGISTERED kind defaults to the SOCIAL grammar — so a
 *     zero-filled `{like, love, haha, wow, fire}` dict on an operator's
 *     official notice is the DEFAULT, not an edge case; and
 *   - `ReactionRail`'s documented fallback is fail-OPEN: with the stoke
 *     fields absent it still renders a flame, lit from any non-zero
 *     legacy count, and "never throws, never blanks the rail".
 *
 * So the payloads below deliberately carry every engagement field
 * POPULATED — a social grammar, legacy counts, a non-zero stoke count,
 * `viewer_has_stoked`, `helpful_count` and `viewer_has_marked`. If the
 * guard ever starts consulting the payload instead of the kind, these
 * turn red. A test with an empty `reactions` block would pass against a
 * guard that reads `stoke_count` — it would prove nothing.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "9001" } } }),
  getSession: async () => null,
}));

import { PostActionBar } from "@/components/feed/PostActionBar";
import {
  KINDS_WITHOUT_ENGAGEMENT,
  POST_KIND_LABELS,
  hasEngagementControls,
} from "@/components/feed/postBody";
import type { FeedItem } from "@/lib/api/types";

beforeAll(() => {
  // jsdom has no matchMedia; HelpfulButton reads it through
  // usePrefersReducedMotion. Same stub the other suites use.
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

/**
 * A payload with EVERY engagement field populated. The kind is the only
 * thing that varies between cases.
 */
function makeItem(postKind: unknown): FeedItem {
  return {
    id: "f1",
    post_kind: postKind as string,
    external_id: 205,
    posted_at: "2026-09-30T14:00:00Z",
    scope_tags: [],
    author: {
      user_id: 7,
      handle: "blacksmith-node",
      reputation_tier: "neutral",
      reputation_tier_label: "Neutral",
    },
    body: { title: "Upgrade to v18 complete", summary: "A one-liner." },
    // Deliberately a SOCIAL grammar with real counts — the shape an
    // unregistered kind gets by default from the normalizer.
    reactions: {
      kind_grammar: "social",
      counts: { like: 12, love: 3, fire: 40 },
      viewer_reaction: "like",
      viewer_has_stoked: true,
      stoke_count: 55,
      heat_stage: 5,
    },
    helpful_count: 9,
    viewer_has_marked: true,
    comment_count: 12,
    permissions: {},
    links: { self: "/v/blacksmith-node/a/4471", author: "/u/blacksmith-node" },
  } as FeedItem;
}

/**
 * Renders one bar and returns a view scoped to ITS OWN container.
 *
 * ⚠ `globals` is not enabled in vitest.config.ts, so
 * @testing-library/react never registers its automatic `afterEach`
 * cleanup and mounted trees ACCUMULATE across tests in a file. A global
 * `screen` query would then find controls belonging to an earlier case —
 * "multiple elements found" at best, and a silently ordering-dependent
 * assertion at worst. Every query below is container-scoped for that
 * reason.
 */
function renderBar(postKind: unknown, canInteract = true) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <PostActionBar
        item={makeItem(postKind)}
        canInteract={canInteract}
        commentCount={12}
        onComment={() => {}}
      />
    </QueryClientProvider>,
  );
  const q = within(utils.container);
  return {
    ...utils,
    /** The Stoke control, by either of its two aria labels. */
    stoke: () =>
      q.queryByLabelText("Stoke") ??
      q.queryByLabelText("Stoked — tap to remove"),
    /** The Mark-helpful control, by either of its two aria labels. */
    helpful: () =>
      q.queryByLabelText("Mark this as helpful") ??
      q.queryByLabelText("You marked this helpful"),
    q,
  };
}

describe("announcement engagement suppression — contract §4.32.15", () => {
  it("renders NEITHER Stoke NOR Mark-helpful for an announcement, despite a fully populated engagement payload", () => {
    const bar = renderBar("announcement");
    expect(bar.stoke()).toBeNull();
    expect(bar.helpful()).toBeNull();
    bar.unmount();
  });

  it("keeps the comment control, Share and the permalink for an announcement", () => {
    const bar = renderBar("announcement");
    // Kept per §4.32.15: the comment control navigates to the permalink,
    // which is where the discussion lives.
    expect(bar.q.getByLabelText("Comments")).toBeTruthy();
    expect(bar.q.getByLabelText("Share post")).toBeTruthy();
    bar.unmount();
  });

  it("renders no orphaned divider once the Helpful control is gone", () => {
    const bar = renderBar("announcement");
    // The rule exists only to separate Helpful from the cluster to its
    // left. With Helpful suppressed it would hang off the end of the row.
    expect(bar.container.querySelectorAll("footer > span[aria-hidden]").length).toBe(0);
    bar.unmount();
  });

  it("still renders BOTH controls for an ordinary status post — the control group", () => {
    const bar = renderBar("status");
    expect(bar.stoke()).toBeTruthy();
    expect(bar.helpful()).toBeTruthy();
    // And the divider that belongs with Helpful is present here.
    expect(bar.container.querySelectorAll("footer > span[aria-hidden]").length).toBe(1);
    bar.unmount();
  });

  it("leaves every other known kind byte-identical", () => {
    const kinds = Object.keys(POST_KIND_LABELS);
    expect(kinds.length).toBeGreaterThan(5);
    for (const kind of kinds) {
      expect(hasEngagementControls(kind)).toBe(true);
      const bar = renderBar(kind);
      expect(bar.stoke(), `stoke missing for kind ${kind}`).toBeTruthy();
      expect(bar.helpful(), `helpful missing for kind ${kind}`).toBeTruthy();
      bar.unmount();
    }
  });

  it("treats a malformed non-string kind as unknown and KEEPS the controls", () => {
    // Failing toward existing behaviour: a corrupt payload must not
    // silently strip engagement from ordinary posts.
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(hasEngagementControls(bad)).toBe(true);
    }
    const bar = renderBar(null);
    expect(bar.stoke()).toBeTruthy();
    expect(bar.helpful()).toBeTruthy();
    bar.unmount();
  });

  it("keys the decision on the kind alone, never on the payload's engagement fields", () => {
    // The same populated payload, two kinds, opposite outcomes. This is
    // the discriminating assertion: a guard reading `stoke_count` or
    // `helpful_count` would answer the same for both.
    expect(hasEngagementControls("announcement")).toBe(false);
    expect(hasEngagementControls("status")).toBe(true);
  });

  it("holds a CLOSED inventory with exactly one entry", () => {
    // §4.32.15: "the client guard is a closed inventory of kinds that
    // currently contains one entry". If a kind is added here, that is a
    // product decision and this assertion is the place it gets noticed.
    expect([...KINDS_WITHOUT_ENGAGEMENT]).toEqual(["announcement"]);
  });

  it("suppresses regardless of canInteract, so a read-only viewer sees no control either", () => {
    // ⚠ The read-only variant of the rail only DISABLES the control; it
    // still renders it. Suppression has to win over that.
    const bar = renderBar("announcement", false);
    expect(bar.stoke()).toBeNull();
    expect(bar.helpful()).toBeNull();
    bar.unmount();

    // ...and the same viewer on an ordinary post still gets both.
    const ordinary = renderBar("status", false);
    expect(ordinary.stoke()).toBeTruthy();
    expect(ordinary.helpful()).toBeTruthy();
    ordinary.unmount();
  });
});
