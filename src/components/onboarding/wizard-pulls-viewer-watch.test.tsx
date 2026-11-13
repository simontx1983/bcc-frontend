/**
 * F-255 / H10 — the onboarding wizard reads each card's own watch answer.
 *
 * It used to key /me/watching (first 50 items) on `card_id`, which for a
 * claimed page is the OWNER's user id, never the page id: a pulled page
 * flipped back to "not pulled" and could not be un-pulled.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Card } from "@/lib/api/types";

type Opts = { onSuccess?: (res: unknown) => void; onSettled?: () => void };
const watchMutate = vi.hoisted(() => vi.fn());
const unwatchMutate = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useWatch", () => ({
  useWatchMutation: () => ({ mutate: watchMutate, isPending: false }),
  useUnwatchMutation: () => ({ mutate: unwatchMutate, isPending: false }),
}));

const { useWizardPulls } = await import("@/components/onboarding/useWizardPulls");

const PAGE = {
  id: 501,
  card_kind: "validator",
  reputation_tier: "neutral",
  viewer_is_watching: false,
  viewer_watch: null,
} as unknown as Card;

beforeEach(() => {
  watchMutate.mockReset();
  unwatchMutate.mockReset();
});

describe("useWizardPulls", () => {
  it("unknown (null) offers no pull: a toggle sends nothing and explains", () => {
    const unknown = { ...PAGE, viewer_is_watching: null } as Card;
    const { result } = renderHook(() => useWizardPulls());
    expect(result.current.isPulled(unknown)).toBe(false);
    act(() => result.current.toggle(unknown));
    expect(watchMutate).not.toHaveBeenCalled();
    expect(result.current.errorFor(unknown.id)).toMatch(/Couldn't check/);
  });

  it("outcomes are keyed on (kind, id): a member 501 is not the validator 501", () => {
    watchMutate.mockImplementation((_r: unknown, o?: Opts) => {
      o?.onSuccess?.({ status: "watched", item: { follow_id: 1, follow_source: "peepso" } });
      o?.onSettled?.();
    });
    const member501 = { ...PAGE, card_kind: "member" } as Card;
    const { result } = renderHook(() => useWizardPulls());
    act(() => result.current.toggle(PAGE));
    expect(result.current.isPulled(PAGE)).toBe(true);
    expect(result.current.isPulled(member501)).toBe(false);
  });

  it("a card already watched (any position) reads pulled and un-pulls with its handle", () => {
    const watched = { ...PAGE, viewer_is_watching: true, viewer_watch: { follow_id: 9073, source: "peepso" } } as Card;
    unwatchMutate.mockImplementation((_r: unknown, o?: Opts) => {
      o?.onSuccess?.({ status: "unwatched" });
      o?.onSettled?.();
    });
    const { result } = renderHook(() => useWizardPulls());
    expect(result.current.isPulled(watched)).toBe(true);
    act(() => result.current.toggle(watched));
    expect(unwatchMutate).toHaveBeenCalledWith(
      expect.objectContaining({ follow_id: 9073, source: "peepso" }),
      expect.anything(),
    );
    expect(result.current.isPulled(watched)).toBe(false);
  });

  it("a pull stays pulled (from the response), and the next toggle un-pulls that follow", () => {
    watchMutate.mockImplementation((_r: unknown, o?: Opts) => {
      o?.onSuccess?.({ status: "watched", item: { follow_id: 4812, follow_source: "peepso" } });
      o?.onSettled?.();
    });
    unwatchMutate.mockImplementation((_r: unknown, o?: Opts) => {
      o?.onSuccess?.({ status: "unwatched" });
      o?.onSettled?.();
    });
    const { result } = renderHook(() => useWizardPulls());

    act(() => result.current.toggle(PAGE));
    expect(result.current.isPulled(PAGE)).toBe(true);
    expect(result.current.pulledCount).toBe(1);

    act(() => result.current.toggle(PAGE));
    expect(unwatchMutate).toHaveBeenCalledWith(
      expect.objectContaining({ follow_id: 4812, source: "peepso" }),
      expect.anything(),
    );
    expect(result.current.isPulled(PAGE)).toBe(false);
  });
});
