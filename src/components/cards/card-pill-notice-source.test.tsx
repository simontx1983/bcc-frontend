/**
 * #276 follow-ups to the F-321 pill notice line:
 *   - Only the pill that raised a notice is described by it. Before, every
 *     pill pointed aria-describedby at the line, so a Vouch failure was
 *     read as Watch's description too.
 *   - The same event twice in a row is announced again. The line is keyed
 *     per event, so a repeat is a fresh live region; before, identical text
 *     in the same element was never re-read.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/directory" }));

const watchMutate = vi.fn();
vi.mock("@/hooks/useWatch", () => ({
  useWatchMutation: () => ({ mutate: watchMutate, isPending: false }),
  useUnwatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
  watchErrorCopy: () => "Couldn't watch this card. Try again.",
}));
vi.mock("@/hooks/useWatching", () => ({
  useWatching: () => ({ data: { items: [] } }),
}));
const castMutate = vi.fn();
vi.mock("@/hooks/useAttestations", () => ({
  useCastAttestation: () => ({ mutate: castMutate, isPending: false }),
  useRevokeAttestation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { ActionBar } = await import("@/components/cards/CardActionBar");

function card(permissions: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: "Atlas",
    card_kind: "validator",
    permissions,
    viewer_attestation: null,
    viewer_is_watching: false,
    viewer_watch: null,
    links: { self: "/v/atlas" },
    ...extra,
  } as never;
}

const perms = {
  can_watch: { allowed: true, unlock_hint: null },
  can_vouch: { allowed: false, unlock_hint: "Vouching unlocks at neutral reputation.", reason_code: "tier_locked" },
};

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  watchMutate.mockReset();
  castMutate.mockReset();
});
afterEach(() => cleanup());

/** Fail the watch call that is in flight. */
function failWatch() {
  const opts = watchMutate.mock.calls.at(-1)?.[1] as { onError: (e: unknown) => void };
  act(() => opts.onError(new Error("x")));
}

describe("the notice describes only the pill that raised it", () => {
  it("a locked Vouch tap describes Vouch, not Watch", () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    const vouch = screen.getByRole("button", { name: "Vouch for Atlas" });
    const watch = screen.getByRole("button", { name: "Watch Atlas" });
    fireEvent.click(vouch);
    const line = screen.getByRole("status");
    expect(vouch).toHaveAttribute("aria-describedby", line.id);
    expect(watch).not.toHaveAttribute("aria-describedby");
  });

  it("a failed Watch describes Watch, not Vouch", () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    const watch = screen.getByRole("button", { name: "Watch Atlas" });
    fireEvent.click(watch);
    failWatch();
    const line = screen.getByRole("alert");
    expect(watch).toHaveAttribute("aria-describedby", line.id);
    expect(screen.getByRole("button", { name: "Vouch for Atlas" })).not.toHaveAttribute(
      "aria-describedby",
    );
  });
});

describe("the same event twice is announced again", () => {
  it("a second identical failure is a fresh alert", () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    const watch = screen.getByRole("button", { name: "Watch Atlas" });
    fireEvent.click(watch);
    failWatch();
    const first = screen.getByRole("alert");
    fireEvent.click(watch);
    failWatch();
    const second = screen.getByRole("alert");
    expect(second).toHaveTextContent("Couldn't watch this card. Try again.");
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
  });

  it("tapping the same locked pill again is a fresh status", () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    const vouch = screen.getByRole("button", { name: "Vouch for Atlas" });
    fireEvent.click(vouch);
    const first = screen.getByRole("status");
    fireEvent.click(vouch);
    expect(screen.getByRole("status")).not.toBe(first);
  });

  it("a failure that recurs in the same render (no unwatch handle) is re-announced", () => {
    // Watched, but the server sent no handle to unwatch with: useViewerWatch
    // clears and re-sets the same error synchronously on every tap.
    render(
      <ActionBar
        card={card(perms, { viewer_is_watching: true, viewer_watch: null })}
        isPulled={false}
      />,
    );
    const unwatch = screen.getByRole("button", { name: "Stop watching Atlas" });
    fireEvent.click(unwatch);
    const first = screen.getByRole("alert");
    fireEvent.click(unwatch);
    expect(screen.getByRole("alert")).not.toBe(first);
  });
});
