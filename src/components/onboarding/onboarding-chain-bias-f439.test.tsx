/**
 * F-439 — the onboarding chain chips now bias the validator suggestions.
 *
 * The chips used to say "Bias suggestions toward" while changing nothing:
 * the pick only went to /complete as `home_chain`. Now the pick goes out
 * as `?chain=` and the server answers with `data.bias`, which says whether
 * the chain really re-ranked the validators.
 *
 * Every claim on screen must come from the RESPONSE:
 *   - a backend without the bias (today's prod) ignores `?chain=` and
 *     sends no `bias` key, so the heading says only "Your home chain",
 *     and a chip click shows no update cue (no "Updating suggestions…",
 *     no dimming), since the same cards come back;
 *   - "Bias validators toward" + "Also sets your home chain." appear only
 *     once a response carries the `bias` key;
 *   - the status line names a chain only when `bias.chain` is the chip
 *     picked now, and says the validators come first only when
 *     `applied_to` includes them;
 *   - the previous chip's cards stay on screen, dimmed with aria-busy,
 *     while the new chip's answer loads, and never speak for it.
 *
 * The hook is REAL, on a real QueryClient; only the endpoint is mocked. The
 * endpoint's own URL building runs for real against a mocked API client.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as OnboardingEndpoints from "@/lib/api/onboarding-endpoints";
import type {
  Card,
  HomeChain,
  OnboardingSuggestions,
  OnboardingSuggestionsBias,
} from "@/lib/api/types";
import type { WizardPullsApi } from "@/components/onboarding/useWizardPulls";

const getOnboardingSuggestions = vi.hoisted(() => vi.fn());
const clientFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/lib/api/client", () => ({
  bccFetchAsClient: clientFetch,
  bccFetch: vi.fn(),
}));
vi.mock("@/lib/api/onboarding-endpoints", () => ({ getOnboardingSuggestions }));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));
// The card face is not under test.
vi.mock("@/components/cards/CardFactory", () => ({
  CardFactory: ({ card }: { card: Card }) => <div data-testid="suggestion-card">{card.name}</div>,
}));

const { useOnboardingSuggestions } = await import("@/hooks/useOnboardingSuggestions");
const { FirstPullsStep } = await import("@/components/onboarding/FirstPullsStep");

// ─── fixtures ────────────────────────────────────────────────────────

function card(id: number): Card {
  return {
    id,
    name: `validator-${id}`,
    card_kind: "validator",
    reputation_tier: "neutral",
    viewer_is_watching: false,
    viewer_watch: null,
  } as unknown as Card;
}

/** A response. Pass `{ bias }` to include the key; omit it for today's prod. */
function answer(ids: number[], withBias?: { bias: OnboardingSuggestionsBias | null }): OnboardingSuggestions {
  const base: OnboardingSuggestions = { validators: ids.map(card), projects: [], creators: [] };
  return withBias === undefined ? base : { ...base, bias: withBias.bias };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const PULLS: WizardPullsApi = {
  isPulled: () => false,
  isPending: () => false,
  errorFor: () => null,
  toggle: () => {},
  pulledCount: 0,
  anyPending: false,
  snapshot: () => [],
};

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** The wizard's own wiring: a chip click sets the chain the step reads. */
function Harness({ initial }: { initial: HomeChain | null }) {
  const [chain, setChain] = useState<HomeChain | null>(initial);
  return (
    <FirstPullsStep
      pulls={PULLS}
      homeChain={chain}
      onSelectChain={setChain}
      onBack={() => {}}
      onDone={() => {}}
    />
  );
}

function renderStep(initial: HomeChain | null = null) {
  const client = newClient();
  return render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}

const status = () => screen.getByRole("status");
const chip = (name: string) => screen.getByRole("button", { name });
const cardNames = () => screen.queryAllByTestId("suggestion-card").map((el) => el.textContent);
const frame = () => screen.getByText("Curated for you").closest("[aria-busy]");

beforeEach(() => {
  getOnboardingSuggestions.mockReset();
  clientFetch.mockReset();
});

afterEach(cleanup);

// ─── the endpoint ────────────────────────────────────────────────────

describe("F-439 — getOnboardingSuggestions sends the chain", () => {
  async function realEndpoint() {
    return vi.importActual<typeof OnboardingEndpoints>("@/lib/api/onboarding-endpoints");
  }

  it("no chain → the bare path, as before", async () => {
    const { getOnboardingSuggestions: real } = await realEndpoint();
    clientFetch.mockResolvedValue(answer([1]));
    const signal = new AbortController().signal;
    await real(null, signal);
    expect(clientFetch).toHaveBeenCalledWith("onboarding/suggestions", { method: "GET", signal });
  });

  it("a chain → ?chain=<slug>", async () => {
    const { getOnboardingSuggestions: real } = await realEndpoint();
    clientFetch.mockResolvedValue(answer([1]));
    await real("cosmos");
    expect(clientFetch).toHaveBeenCalledWith("onboarding/suggestions?chain=cosmos", {
      method: "GET",
      signal: undefined,
    });
  });
});

// ─── the hook ────────────────────────────────────────────────────────

describe("F-439 — useOnboardingSuggestions keys on the chain", () => {
  function wrapper(client: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
  }

  it("the chain is in the query key and the request", async () => {
    const client = newClient();
    getOnboardingSuggestions.mockResolvedValue(answer([1]));
    const { result } = renderHook(() => useOnboardingSuggestions("osmosis"), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getOnboardingSuggestions).toHaveBeenCalledWith("osmosis", expect.any(AbortSignal));
    expect(client.getQueryData(["onboarding", "suggestions", "osmosis"])).toEqual(answer([1]));
  });

  it("a new chain keeps the previous cards as placeholder data until its own answer lands", async () => {
    const client = newClient();
    const next = deferred<OnboardingSuggestions>();
    getOnboardingSuggestions.mockImplementation((chain: HomeChain | null) =>
      chain === null ? Promise.resolve(answer([1, 2])) : next.promise,
    );
    const { result, rerender } = renderHook(({ chain }) => useOnboardingSuggestions(chain), {
      wrapper: wrapper(client),
      initialProps: { chain: null as HomeChain | null },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ chain: "cosmos" });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data?.validators.map((c) => c.id)).toEqual([1, 2]);

    await act(async () => next.resolve(answer([9], { bias: { chain: "cosmos", applied_to: ["validators"] } })));
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.validators.map((c) => c.id)).toEqual([9]);
  });
});

// ─── the step ────────────────────────────────────────────────────────

describe("F-439 — today's prod backend (no `bias` key) claims nothing", () => {
  it("the heading is 'Your home chain' and no chip claims to change the suggestions", async () => {
    getOnboardingSuggestions.mockImplementation(() => Promise.resolve(answer([1, 2])));
    renderStep();
    await waitFor(() => expect(cardNames()).toEqual(["validator-1", "validator-2"]));

    expect(screen.getByRole("group", { name: "Your home chain" })).toBeTruthy();
    expect(screen.queryByText("Bias validators toward")).toBeNull();
    expect(screen.queryByText("Also sets your home chain.")).toBeNull();

    fireEvent.click(chip("Cosmos"));
    expect(getOnboardingSuggestions).toHaveBeenLastCalledWith("cosmos", expect.any(AbortSignal));
    // Let the cosmos answer land.
    await act(async () => {});

    // The old backend ignored ?chain=: no bias key, so nothing is claimed.
    expect(status().textContent).toBe("");
    expect(screen.getByRole("group", { name: "Your home chain" })).toBeTruthy();
    expect(screen.queryByText(/validators come first/)).toBeNull();
    expect(chip("Cosmos").getAttribute("aria-pressed")).toBe("true");
  });

  it("a chip's request in flight shows no update cue: the same cards are coming back", async () => {
    const cosmos = deferred<OnboardingSuggestions>();
    getOnboardingSuggestions.mockImplementation((chain: HomeChain | null) =>
      chain === null ? Promise.resolve(answer([1, 2])) : cosmos.promise,
    );
    renderStep();
    await waitFor(() => expect(cardNames()).toEqual(["validator-1", "validator-2"]));

    fireEvent.click(chip("Cosmos"));
    expect(getOnboardingSuggestions).toHaveBeenLastCalledWith("cosmos", expect.any(AbortSignal));
    expect(status().textContent).toBe("");
    expect(screen.queryByText("Updating suggestions…")).toBeNull();
    expect(frame()?.getAttribute("aria-busy")).toBe("false");
    expect(frame()?.className ?? "").not.toContain("opacity-60");
    expect(cardNames()).toEqual(["validator-1", "validator-2"]);

    await act(async () => cosmos.resolve(answer([1, 2])));
    await waitFor(() => expect(getOnboardingSuggestions).toHaveBeenCalledTimes(2));
    expect(status().textContent).toBe("");
    expect(cardNames()).toEqual(["validator-1", "validator-2"]);
  });

  it("an empty answer stays the empty sheet (no skeleton) while a chip's request flies", async () => {
    const cosmos = deferred<OnboardingSuggestions>();
    getOnboardingSuggestions.mockImplementation((chain: HomeChain | null) =>
      chain === null ? Promise.resolve(answer([])) : cosmos.promise,
    );
    renderStep();
    await waitFor(() => expect(screen.getByText("No suggestions yet")).toBeTruthy());

    fireEvent.click(chip("Cosmos"));
    expect(screen.getByText("No suggestions yet")).toBeTruthy();
    expect(screen.queryAllByTestId("suggestion-skeleton")).toHaveLength(0);
    await act(async () => cosmos.resolve(answer([])));
  });

  it("before the first answer the heading claims nothing either", () => {
    getOnboardingSuggestions.mockImplementation(() => new Promise(() => {}));
    renderStep();
    expect(screen.getByRole("group", { name: "Your home chain" })).toBeTruthy();
    expect(screen.queryByText("Also sets your home chain.")).toBeNull();
  });
});

describe("F-439 — a backend with the bias labels from `data.bias`", () => {
  it("no chain (bias: null) → 'Bias validators toward' + the home-chain hint, an empty status", async () => {
    getOnboardingSuggestions.mockResolvedValue(answer([1], { bias: null }));
    renderStep();
    await waitFor(() => expect(cardNames()).toEqual(["validator-1"]));

    expect(screen.getByRole("group", { name: "Bias validators toward" })).toBeTruthy();
    expect(screen.getByText("Also sets your home chain.")).toBeTruthy();
    expect(status().textContent).toBe("");
  });

  it("applied_to includes validators → 'Cosmos validators come first.'", async () => {
    getOnboardingSuggestions.mockResolvedValue(
      answer([7, 1], { bias: { chain: "cosmos", applied_to: ["validators"] } }),
    );
    renderStep("cosmos");
    await waitFor(() => expect(status().textContent).toBe("Cosmos validators come first."));
    expect(getOnboardingSuggestions).toHaveBeenCalledWith("cosmos", expect.any(AbortSignal));
    expect(cardNames()).toEqual(["validator-7", "validator-1"]);
  });

  it("applied_to: [] (no validator on the chain, or the fallback path) → unchanged, said plainly", async () => {
    getOnboardingSuggestions.mockResolvedValue(answer([1], { bias: { chain: "ethereum", applied_to: [] } }));
    renderStep("ethereum");
    await waitFor(() =>
      expect(status().textContent).toBe("Validator suggestions are unchanged for Ethereum."),
    );
    expect(screen.queryByText(/validators come first/)).toBeNull();
  });

  it("a `bias` for another chain than the chip claims nothing", async () => {
    getOnboardingSuggestions.mockResolvedValue(
      answer([1], { bias: { chain: "cosmos", applied_to: ["validators"] } }),
    );
    renderStep("osmosis");
    await waitFor(() => expect(cardNames()).toEqual(["validator-1"]));
    expect(status().textContent).toBe("");
  });

  it("the previous chip's cards stay, dimmed and busy, and never speak for the new chip", async () => {
    const osmosis = deferred<OnboardingSuggestions>();
    getOnboardingSuggestions.mockImplementation((chain: HomeChain | null) =>
      chain === "cosmos"
        ? Promise.resolve(answer([7], { bias: { chain: "cosmos", applied_to: ["validators"] } }))
        : osmosis.promise,
    );
    renderStep("cosmos");
    await waitFor(() => expect(status().textContent).toBe("Cosmos validators come first."));
    expect(frame()?.getAttribute("aria-busy")).toBe("false");

    fireEvent.click(chip("Osmosis"));
    expect(status().textContent).toBe("Updating suggestions…");
    expect(cardNames()).toEqual(["validator-7"]);
    expect(frame()?.getAttribute("aria-busy")).toBe("true");
    expect(frame()?.className).toContain("opacity-60");
    expect(screen.queryByText("Cosmos validators come first.")).toBeNull();

    await act(async () =>
      osmosis.resolve(answer([8], { bias: { chain: "osmosis", applied_to: ["validators"] } })),
    );
    await waitFor(() => expect(status().textContent).toBe("Osmosis validators come first."));
    expect(cardNames()).toEqual(["validator-8"]);
    expect(frame()?.getAttribute("aria-busy")).toBe("false");
    expect(frame()?.className ?? "").not.toContain("opacity-60");
  });

  it("an empty answer for the previous chip shows the skeleton, not 'No suggestions yet', while the next loads", async () => {
    const cosmos = deferred<OnboardingSuggestions>();
    getOnboardingSuggestions.mockImplementation((chain: HomeChain | null) =>
      chain === null ? Promise.resolve(answer([], { bias: null })) : cosmos.promise,
    );
    renderStep();
    await waitFor(() => expect(screen.getByText("No suggestions yet")).toBeTruthy());

    fireEvent.click(chip("Cosmos"));
    expect(screen.queryByText("No suggestions yet")).toBeNull();
    expect(screen.getAllByTestId("suggestion-skeleton").length).toBeGreaterThan(0);

    await act(async () => cosmos.resolve(answer([3], { bias: { chain: "cosmos", applied_to: ["validators"] } })));
    await waitFor(() => expect(cardNames()).toEqual(["validator-3"]));
  });

  it("a failed new chip shows the load failure and claims nothing", async () => {
    getOnboardingSuggestions.mockImplementation((chain: HomeChain | null) =>
      chain === null
        ? Promise.resolve(answer([1], { bias: null }))
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    renderStep();
    await waitFor(() => expect(cardNames()).toEqual(["validator-1"]));

    fireEvent.click(chip("Solana"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Couldn't load suggestions. Try again in a moment."),
    );
    expect(status().textContent).toBe("");
  });

  it("deselecting the chip goes back to the unbiased answer from cache", async () => {
    getOnboardingSuggestions.mockImplementation((chain: HomeChain | null) =>
      Promise.resolve(
        chain === null
          ? answer([1, 2], { bias: null })
          : answer([7], { bias: { chain: "cosmos", applied_to: ["validators"] } }),
      ),
    );
    renderStep();
    await waitFor(() => expect(cardNames()).toEqual(["validator-1", "validator-2"]));
    fireEvent.click(chip("Cosmos"));
    await waitFor(() => expect(status().textContent).toBe("Cosmos validators come first."));

    fireEvent.click(chip("Cosmos"));
    expect(cardNames()).toEqual(["validator-1", "validator-2"]);
    expect(status().textContent).toBe("");
    expect(getOnboardingSuggestions).toHaveBeenCalledTimes(2);
  });
});
