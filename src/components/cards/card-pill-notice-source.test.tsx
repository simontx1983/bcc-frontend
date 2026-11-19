/**
 * #276 follow-ups to the F-321 pill notice line:
 *   - Only the pill that raised a notice is described by it. Before, every
 *     pill pointed aria-describedby at the line, so a Vouch failure was
 *     read as Watch's description too.
 *   - The same event twice in a row is announced again: the region stays
 *     mounted and each event's text is a fresh span inside it (a region
 *     inserted already holding its text is often not read), so a repeat is
 *     a new insertion; before, identical text in the same element was never
 *     re-read.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { filledNotice } from "@/components/cards/pill-notice.testing";

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

const { ActionBar, NOTICE_FILL_DELAY_MS } = await import("@/components/cards/CardActionBar");

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
  it("a locked Vouch tap describes Vouch, not Watch", async () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    const vouch = screen.getByRole("button", { name: "Vouch for Atlas" });
    const watch = screen.getByRole("button", { name: "Watch Atlas" });
    fireEvent.click(vouch);
    const line = await filledNotice("status");
    expect(vouch).toHaveAttribute("aria-describedby", line.id);
    expect(watch).not.toHaveAttribute("aria-describedby");
  });

  it("a failed Watch describes Watch, not Vouch", async () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    const watch = screen.getByRole("button", { name: "Watch Atlas" });
    fireEvent.click(watch);
    failWatch();
    const line = await filledNotice("alert");
    expect(watch).toHaveAttribute("aria-describedby", line.id);
    expect(screen.getByRole("button", { name: "Vouch for Atlas" })).not.toHaveAttribute(
      "aria-describedby",
    );
  });
});

describe("the same event twice is announced again", () => {
  it("a second identical failure is a new insertion into the same, already-mounted alert", async () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    const watch = screen.getByRole("button", { name: "Watch Atlas" });
    fireEvent.click(watch);
    failWatch();
    const region = await filledNotice("alert");
    const firstText = region.firstElementChild;
    fireEvent.click(watch);
    failWatch();
    await waitFor(() => expect(region.firstElementChild).not.toBe(firstText));
    expect(screen.getByRole("alert")).toBe(region);
    expect(region).toHaveTextContent("Couldn't watch this card. Try again.");
    expect(firstText?.isConnected).toBe(false);
  });

  it("a fresh region mounts EMPTY and receives its text a beat later", () => {
    vi.useFakeTimers();
    try {
      render(<ActionBar card={card(perms)} isPulled={false} />);
      fireEvent.click(screen.getByRole("button", { name: "Vouch for Atlas" }));
      const region = screen.getByRole("status");
      expect(region).toHaveTextContent("");
      act(() => {
        vi.advanceTimersByTime(NOTICE_FILL_DELAY_MS);
      });
      expect(region).toHaveTextContent("Vouching unlocks at neutral reputation.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("tapping the same locked pill again inserts fresh text into the same status", async () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    const vouch = screen.getByRole("button", { name: "Vouch for Atlas" });
    fireEvent.click(vouch);
    const region = await filledNotice("status");
    const firstText = region.firstElementChild;
    fireEvent.click(vouch);
    await waitFor(() => expect(region.firstElementChild).not.toBe(firstText));
    expect(screen.getByRole("status")).toBe(region);
  });

  it("a failure that recurs in the same render (no unwatch handle) is re-announced", async () => {
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
    const region = await filledNotice("alert");
    const firstText = region.firstElementChild;
    fireEvent.click(unwatch);
    await waitFor(() => expect(region.firstElementChild).not.toBe(firstText));
  });
});
