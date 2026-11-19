/**
 * F-264 (UX Lows) — onboarding's first-watch step.
 *
 * 1. A failed watch or unwatch used to say "pull" ("Sign in to pull
 *    cards.", "Couldn't update this pull."), the retired word, to a
 *    brand-new member. It now reads the shared `watchErrorCopy`, plus the
 *    wizard's own lapsed-session and outage lines. `watchErrorCopy` is the
 *    REAL helper here: only the two mutations are stubbed.
 * 2. The empty state said "once admins curate cards". Now it says plainly
 *    that there is nothing to suggest, and how to carry on.
 * 3. Loading was one line of text, so the step jumped by a card's height
 *    when the suggestions arrived. It is now card-sized skeleton tiles in
 *    the same frame as the loaded cards.
 */

import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type * as UseWatchModule from "@/hooks/useWatch";
import type { Card, OnboardingSuggestions } from "@/lib/api/types";
import { FOLLOW_COPY } from "@/lib/copy";

type Opts = { onError?: (err: unknown) => void; onSettled?: () => void };
const watchMutate = vi.hoisted(() => vi.fn());
const unwatchMutate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/hooks/useWatch", async (importOriginal) => ({
  ...(await importOriginal<typeof UseWatchModule>()),
  useWatchMutation: () => ({ mutate: watchMutate, isPending: false }),
  useUnwatchMutation: () => ({ mutate: unwatchMutate, isPending: false }),
}));

const suggestions = vi.hoisted(() => ({
  value: {
    data: undefined as OnboardingSuggestions | undefined,
    isLoading: true,
    isError: false,
    error: null as unknown,
    refetch: () => Promise.resolve(),
  },
}));
vi.mock("@/hooks/useOnboardingSuggestions", () => ({
  ONBOARDING_SUGGESTIONS_KEY: ["onboarding", "suggestions"],
  useOnboardingSuggestions: () => suggestions.value,
}));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));
// The card face is not under test; a stub keeps the grid assertions about
// the frame the cards sit in.
vi.mock("@/components/cards/CardFactory", () => ({
  CardFactory: ({ card }: { card: Card }) => <div data-testid="suggestion-card">{card.name}</div>,
}));

const { useWizardPulls } = await import("@/components/onboarding/useWizardPulls");
const { FirstPullsStep } = await import("@/components/onboarding/FirstPullsStep");

const CARD = {
  id: 501,
  name: "Riggers Node",
  card_kind: "validator",
  reputation_tier: "neutral",
  viewer_is_watching: false,
  viewer_watch: null,
} as unknown as Card;
const WATCHED = {
  ...CARD,
  viewer_is_watching: true,
  viewer_watch: { follow_id: 77, source: "peepso" },
} as unknown as Card;

function apiError(code: string, data?: Record<string, unknown>): BccApiError {
  return new BccApiError(code, "server words, never shown", 400, {
    error: { code, message: "server words, never shown", ...(data ? { data } : {}) },
  } as never);
}

function failWith(mutate: typeof watchMutate, err: unknown) {
  mutate.mockImplementation((_req: unknown, o?: Opts) => {
    o?.onError?.(err);
    o?.onSettled?.();
  });
}

afterEach(cleanup);

beforeEach(() => {
  watchMutate.mockReset();
  unwatchMutate.mockReset();
  suggestions.value = {
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    refetch: () => Promise.resolve(),
  };
});

describe("F-264 — a failed watch in onboarding says watch, not pull", () => {
  const WATCH_CASES: ReadonlyArray<[string, unknown, string]> = [
    ["a lapsed session", apiError("bcc_unauthorized"), "Sign in to watch cards."],
    ["an expired token (reads as a lapsed session)", apiError("bcc_token_expired"), "Sign in to watch cards."],
    ["an outage", apiError("bcc_unavailable"), "Watching is temporarily unavailable. Try again shortly."],
    ["a refusal (block or suspension)", apiError("bcc_forbidden"), FOLLOW_COPY.refused],
    ["a private profile", apiError("bcc_forbidden", { reason: "profile_private" }), FOLLOW_COPY.private],
    ["a rate limit", apiError("bcc_rate_limited"), "Too fast — wait a moment and try again."],
    ["a network failure", new TypeError("Failed to fetch"), FOLLOW_COPY.failed],
  ];

  it.each(WATCH_CASES)("watch fails with %s → the shared watch line", (_name, err, line) => {
    failWith(watchMutate, err);
    const { result } = renderHook(() => useWizardPulls());
    act(() => result.current.toggle(CARD));
    expect(result.current.errorFor(CARD.id)).toBe(line);
    expect(result.current.isPulled(CARD)).toBe(false);
  });

  it("unwatch failing reads as the shared unwatch line, never the watch refusal", () => {
    failWith(unwatchMutate, apiError("bcc_forbidden"));
    const { result } = renderHook(() => useWizardPulls());
    act(() => result.current.toggle(WATCHED));
    expect(result.current.errorFor(WATCHED.id)).toBe(FOLLOW_COPY.failed);
  });

  it("unwatch during an outage gets the wizard's outage line", () => {
    failWith(unwatchMutate, apiError("bcc_unavailable"));
    const { result } = renderHook(() => useWizardPulls());
    act(() => result.current.toggle(WATCHED));
    expect(result.current.errorFor(WATCHED.id)).toBe(
      "Watching is temporarily unavailable. Try again shortly.",
    );
  });

  it("a watched card with no handle to unwatch it explains, and sends nothing", () => {
    const noHandle = { ...WATCHED, viewer_watch: null } as unknown as Card;
    const { result } = renderHook(() => useWizardPulls());
    act(() => result.current.toggle(noHandle));
    expect(unwatchMutate).not.toHaveBeenCalled();
    expect(result.current.errorFor(noHandle.id)).toBe(FOLLOW_COPY.failed);
  });

  it("no failure line says pull", () => {
    const lines: string[] = [];
    for (const [, err] of WATCH_CASES) {
      failWith(watchMutate, err);
      failWith(unwatchMutate, err);
      const { result, unmount } = renderHook(() => useWizardPulls());
      act(() => result.current.toggle(CARD));
      act(() => result.current.toggle(WATCHED));
      lines.push(result.current.errorFor(CARD.id) ?? "", result.current.errorFor(WATCHED.id) ?? "");
      unmount();
    }
    expect(lines.filter((l) => l === "")).toEqual([]);
    for (const line of lines) expect(line).not.toMatch(/pull/i);
  });
});

function renderStep() {
  const pulls = {
    isPulled: () => false,
    isPending: () => false,
    errorFor: () => null,
    toggle: () => {},
    pulledCount: 0,
    anyPending: false,
    snapshot: () => [],
  };
  return render(
    <FirstPullsStep
      pulls={pulls}
      homeChain={null}
      onSelectChain={() => {}}
      onBack={() => {}}
      onDone={() => {}}
    />,
  );
}

describe("F-264 — the first-watch step's empty and loading states", () => {
  it("empty: says there is nothing to suggest, with no talk of admins curating", () => {
    suggestions.value = {
      ...suggestions.value,
      isLoading: false,
      data: { validators: [], projects: [], creators: [] } as unknown as OnboardingSuggestions,
    };
    const { container } = renderStep();
    expect(screen.getByText("No suggestions yet")).toBeTruthy();
    expect(
      screen.getByText(
        "There are no cards to suggest right now. Skip this step and head to the Floor — you can watch anyone, any time.",
      ),
    ).toBeTruthy();
    expect(container.textContent).not.toMatch(/admin|curate cards|warming up/i);
  });

  it("loading: card-sized skeleton tiles, hidden from assistive tech, and a spoken loading line", () => {
    const { container } = renderStep();
    const tiles = screen.getAllByTestId("suggestion-skeleton");
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) {
      const cls = tile.className.split(/\s+/);
      expect(cls).toEqual(expect.arrayContaining([
        "bcc-panel",
        "motion-safe:animate-pulse",
        "aspect-[316/440]",
        "w-full",
        "max-w-[296px]",
        "min-[381px]:max-w-[316px]",
      ]));
      expect(tile.closest("[aria-hidden]")).not.toBeNull();
    }
    const spoken = screen.getByText("Loading suggestions…");
    expect(spoken.className).toContain("sr-only");
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    // The old visible text line is gone.
    expect(container.querySelector(".bcc-onb-note")).toBeNull();
  });

  it("loading and loaded share one frame, so the cards land where the tiles were", () => {
    const view = renderStep();
    const frameOf = (el: Element) => {
      const row = el.closest("div[style*='flex-wrap']");
      const frame = row?.parentElement;
      // jsdom drops clamp()/min() declarations, so the frame is compared by
      // its shape (label row, then the card row) and the row by what it
      // keeps (flex, wrap, centred).
      return {
        frameChildren: frame?.children.length,
        label: frame?.firstElementChild?.textContent,
        row: row?.getAttribute("style"),
      };
    };
    const loading = frameOf(screen.getAllByTestId("suggestion-skeleton")[0]!);

    suggestions.value = {
      ...suggestions.value,
      isLoading: false,
      data: { validators: [CARD], projects: [], creators: [] } as unknown as OnboardingSuggestions,
    };
    view.rerender(
      <FirstPullsStep
        pulls={{
          isPulled: () => false,
          isPending: () => false,
          errorFor: () => null,
          toggle: () => {},
          pulledCount: 0,
          anyPending: false,
          snapshot: () => [],
        }}
        homeChain={null}
        onSelectChain={() => {}}
        onBack={() => {}}
        onDone={() => {}}
      />,
    );
    expect(screen.queryAllByTestId("suggestion-skeleton")).toHaveLength(0);
    const loaded = frameOf(screen.getByTestId("suggestion-card"));

    expect(loading.label).toBe("Curated for you");
    expect(loading.frameChildren).toBe(2);
    expect(loading.row).toContain("flex-wrap: wrap");
    expect(loaded).toEqual(loading);
  });
});
