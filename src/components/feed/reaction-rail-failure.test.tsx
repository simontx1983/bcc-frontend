/**
 * F-258 (audit M5), the post rail: Stoke (ReactionRail) and Helpful
 * (PostHelpfulButton).
 *
 * A signed-out visitor's tap showed the spark burst, then the 401 rolled
 * it back without a word; a signed-in viewer's failed toggle did the same.
 * Signed out, both pills are now sign-in links, and a failed toggle says so
 * in a line under the action row.
 *
 * The mutation hooks are stubs that capture each call's callbacks, so a
 * test decides when a toggle fails. The hooks' own rollback is covered by
 * their tests; this file is about what the viewer sees and hears.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type FeedItem } from "@/lib/api/types";

type Callbacks = { onError?: (err: unknown) => void };

const state = vi.hoisted(() => ({
  session: "authenticated" as "authenticated" | "unauthenticated" | "loading",
  stoke: [] as { id: string; cb: Callbacks }[],
  unstoke: [] as { id: string; cb: Callbacks }[],
  helpful: [] as { vars: { feedId: string; hasMarked: boolean }; cb: Callbacks }[],
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: state.session, data: null }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/communities/riggers" }));
vi.mock("@/hooks/useStoke", () => ({
  useStokeMutation: () => ({
    mutate: (id: string, cb: Callbacks) => state.stoke.push({ id, cb }),
    isPending: false,
  }),
  useUnstokeMutation: () => ({
    mutate: (id: string, cb: Callbacks) => state.unstoke.push({ id, cb }),
    isPending: false,
  }),
}));
vi.mock("@/hooks/useMarkHelpful", () => ({
  useMarkHelpful: () => ({
    mutate: (vars: { feedId: string; hasMarked: boolean }, cb: Callbacks) =>
      state.helpful.push({ vars, cb }),
    isPending: false,
  }),
  useMarkHelpfulComment: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { ReactionRail } = await import("@/components/feed/ReactionRail");
const { PostHelpfulButton } = await import("@/components/feed/HelpfulButton");
const { reactionFailureCopy } = await import("@/components/feed/ReactionFailureNotice");

const item = (extra: Partial<FeedItem> = {}) =>
  ({
    id: "feed_9",
    reactions: { counts: {}, heat_stage: 2, viewer_has_stoked: false, stoke_count: 3 },
    helpful_count: 1,
    viewer_has_marked: false,
    ...extra,
  }) as unknown as FeedItem;

const apiErr = (code: string, status = 400) => new BccApiError(code, "RAW SERVER TEXT", status, null);

/** Both pills in a wrapping row, as PostActionBar renders them. */
function rail(props: { item?: FeedItem; canInteract?: boolean } = {}) {
  const it = props.item ?? item();
  const canInteract = props.canInteract ?? true;
  return render(
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <ReactionRail item={it} canInteract={canInteract} />
      <PostHelpfulButton item={it} canInteract={canInteract} />
    </footer>,
  );
}

const regions = () => Array.from(document.querySelectorAll('footer > [aria-live="polite"]')) as HTMLElement[];

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  state.session = "authenticated";
  state.stoke = [];
  state.unstoke = [];
  state.helpful = [];
});

afterEach(() => cleanup());

describe("signed out, Stoke and Helpful are sign-in links", () => {
  it("both pills link to sign in and back to this page; no toggle exists to send", () => {
    state.session = "unauthenticated";
    rail();
    const stoke = screen.getByRole("link", { name: "Sign in to stoke" });
    const helpful = screen.getByRole("link", { name: "Sign in to mark this helpful" });
    expect(stoke).toHaveAttribute("href", "/login?callbackUrl=%2Fcommunities%2Friggers");
    expect(helpful).toHaveAttribute("href", "/login?callbackUrl=%2Fcommunities%2Friggers");
    // The count still shows on the link.
    expect(stoke).toHaveTextContent("3");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("while the session loads they stay buttons, so a signed-in viewer sees no flash", () => {
    state.session = "loading";
    rail();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Stoke" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark this as helpful" })).toBeInTheDocument();
  });

  it("the non-member teaser stays a read-only pill for a signed-out visitor", () => {
    state.session = "unauthenticated";
    rail({ canInteract: false });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Stoke" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mark this as helpful" })).toBeDisabled();
  });
});

describe("a failed toggle says so under the action row", () => {
  it("each pill's polite region is mounted empty and out of the layout", () => {
    rail();
    const [stokeRegion, helpfulRegion] = regions();
    for (const region of [stokeRegion, helpfulRegion]) {
      expect(region).toHaveAttribute("aria-atomic", "true");
      expect(region).toHaveClass("sr-only");
      expect(region!.textContent).toBe("");
    }
    // Not a role: a feed renders one per pill.
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failed stoke fills its region with the line, under the whole row", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: "Stoke" }));
    expect(state.stoke[0]!.id).toBe("feed_9");
    act(() => state.stoke[0]!.cb.onError?.(apiErr("bcc_internal_error", 500)));

    const region = regions()[0]!;
    expect(region.textContent).toBe("Couldn't stoke this. Try again.");
    expect(region).not.toHaveClass("sr-only");
    expect(region).toHaveClass("order-last", "basis-full");
  });

  it("an unstoke failure says which way it failed", () => {
    rail({ item: item({ reactions: { counts: {}, heat_stage: 2, viewer_has_stoked: true, stoke_count: 4 } } as never) });
    fireEvent.click(screen.getByRole("button", { name: "Stoked — tap to remove" }));
    act(() => state.unstoke[0]!.cb.onError?.(apiErr("bcc_internal_error", 500)));
    expect(regions()[0]!.textContent).toBe("Couldn't remove your stoke. Try again.");
  });

  it("a 401 (a session that ended) says to sign in, never the raw text", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: "Stoke" }));
    act(() => state.stoke[0]!.cb.onError?.(apiErr("bcc_unauthorized", 401)));
    expect(regions()[0]!.textContent).toBe("Sign in to stoke.");
    expect(document.body.textContent).not.toMatch(/RAW SERVER TEXT/);
  });

  it("a suspended member's stoke says so, instead of an endless Try again", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: "Stoke" }));
    act(() => state.stoke[0]!.cb.onError?.(apiErr("bcc_forbidden", 403)));
    expect(regions()[0]!.textContent).toBe("Your account is suspended, so you can't react right now.");
    expect(regions()[0]!.textContent).not.toMatch(/try again/i);
  });

  it("a refused no-reactions post says so, not that the member is suspended", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: "Mark this as helpful" }));
    act(() =>
      state.helpful[0]!.cb.onError?.(
        new BccApiError("bcc_forbidden", "RAW", 403, {
          error: { code: "bcc_forbidden", message: "RAW", data: { reason_code: "reactions_not_applicable" } },
        } as never),
      ),
    );
    expect(regions()[1]!.textContent).toBe("This kind of post doesn't take reactions.");
    expect(document.body.textContent).not.toMatch(/suspended/i);
  });

  it("the next press clears the line, and a repeat failure is a fresh span", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: "Stoke" }));
    act(() => state.stoke[0]!.cb.onError?.(apiErr("bcc_internal_error", 500)));
    const region = regions()[0]!;
    const span = region.firstElementChild;

    fireEvent.click(screen.getByRole("button", { name: "Stoke" }));
    expect(region.textContent).toBe("");

    act(() => state.stoke[1]!.cb.onError?.(apiErr("bcc_internal_error", 500)));
    expect(regions()[0]).toBe(region);
    expect(region.textContent).toBe("Couldn't stoke this. Try again.");
    expect(region.firstElementChild).not.toBe(span);
  });

  it("a failed Helpful mark fills its own region", () => {
    rail();
    fireEvent.click(screen.getByRole("button", { name: "Mark this as helpful" }));
    expect(state.helpful[0]!.vars).toEqual({ feedId: "feed_9", hasMarked: false });
    act(() => state.helpful[0]!.cb.onError?.(apiErr("bcc_rate_limited", 429)));
    expect(regions()[1]!.textContent).toBe("Too many taps. Wait a moment, then try again.");
    expect(regions()[0]!.textContent).toBe("");

    // The next Helpful press clears its line.
    fireEvent.click(screen.getByRole("button", { name: "Mark this as helpful" }));
    expect(state.helpful).toHaveLength(2);
    expect(regions()[1]!.textContent).toBe("");
  });

  it("a failed unmark says which way it failed", () => {
    rail({ item: item({ viewer_has_marked: true }) });
    fireEvent.click(screen.getByRole("button", { name: "You marked this helpful" }));
    act(() => state.helpful[0]!.cb.onError?.(apiErr("bcc_internal_error", 500)));
    expect(regions()[1]!.textContent).toBe("Couldn't remove your helpful mark. Try again.");
  });
});

describe("reactionFailureCopy", () => {
  it.each([
    ["bcc_unauthorized", "stoke", false, "Sign in to stoke."],
    ["bcc_token_expired", "helpful", false, "Sign in to mark this helpful."],
    ["bcc_permission_denied", "stoke", false, "You can't react here."],
    ["bcc_forbidden", "stoke", false, "Your account is suspended, so you can't react right now."],
    ["bcc_forbidden", "stoke", true, "Your account is suspended, so you can't react right now."],
    ["bcc_forbidden", "helpful", false, "Your account is suspended, so you can't react right now."],
    ["bcc_not_found", "helpful", true, "This is no longer available."],
    ["bcc_rate_limited", "helpful", true, "Too many taps. Wait a moment, then try again."],
    ["bcc_internal_error", "helpful", false, "Couldn't mark this helpful. Try again."],
  ] as const)("%s on %s (removing=%s) reads %j", (code, kind, removing, expected) => {
    expect(reactionFailureCopy(apiErr(code), kind, removing)).toBe(expected);
  });

  it("a post kind that takes no reactions is never read as a suspension", () => {
    const notApplicable = new BccApiError("bcc_forbidden", "This kind of post does not take reactions.", 403, {
      error: {
        code: "bcc_forbidden",
        message: "This kind of post does not take reactions.",
        data: { reason_code: "reactions_not_applicable" },
      },
    } as never);
    for (const [kind, removing] of [["stoke", false], ["stoke", true], ["helpful", false]] as const) {
      expect(reactionFailureCopy(notApplicable, kind, removing)).toBe("This kind of post doesn't take reactions.");
    }
    // Another reason_code (or none) stays the suspended line.
    const other = new BccApiError("bcc_forbidden", "x", 403, {
      error: { code: "bcc_forbidden", message: "x", data: { reason_code: "something_else" } },
    } as never);
    expect(reactionFailureCopy(other, "stoke", false)).toBe(
      "Your account is suspended, so you can't react right now.",
    );
  });

  it("a non-API error gets the direction's plain line", () => {
    expect(reactionFailureCopy(new TypeError("Failed to fetch"), "stoke", true)).toBe(
      "Couldn't remove your stoke. Try again.",
    );
  });
});
