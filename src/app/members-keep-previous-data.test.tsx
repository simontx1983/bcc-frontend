/**
 * F-260 M10 — /members keeps the roster on screen while a new search loads.
 *
 * Every debounced keystroke, role chip and page step is a new useMembers
 * query key. With no placeholder the query went back to `isPending`, so the
 * grid was swapped for "Loading the roster…" and the role counts fell to
 * ZERO_TYPE_COUNTS, which hides every chip that is not active. While typing,
 * the whole roster and the filter row flickered out and back.
 *
 * /members now opts into `keepPreviousData`. These tests run the REAL hook
 * against a real QueryClient (only the endpoint is mocked), so they pin the
 * TanStack behaviour the page relies on as well as the page's use of it:
 *   - the old rows and counts stay, dimmed with aria-busy, until the new
 *     ones land, and an always-mounted status region says "Updating";
 *   - the count line keeps naming the search the rows answer;
 *   - an empty answer to the OLD filters is not shown under the new ones;
 *   - a failed new key still falls back to the error + last-good pager;
 *   - the option is opt-in: other callers still see a pending query.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const state = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));
const getMembers = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => state.searchParams,
}));
vi.mock("@/lib/api/members-endpoints", () => ({ getMembers }));
// Card rendering is irrelevant here and pulls the API client.
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: Array<{ id: number }> }) => (
    <ul data-testid="card-grid">
      {cards.map((c) => (
        <li key={c.id}>member-{c.id}</li>
      ))}
    </ul>
  ),
}));

import MembersPage from "@/app/(main)/(app)/members/page";
import { useMembers } from "@/hooks/useMembers";

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

beforeEach(() => {
  getMembers.mockReset();
  state.searchParams = new URLSearchParams();
});

afterEach(cleanup);

const COUNTS = { validator: 3, project: 0, nft: 0, dao: 0 };

function page(ids: number[], counts = COUNTS, totalPages = 3) {
  return {
    items: ids.map((id) => ({ id })),
    pagination: { page: 1, per_page: 24, total: ids.length, total_pages: totalPages },
    type_counts: counts,
  };
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

function client() {
  // retry off: the failure case asserts the settled error, not the retry.
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(qc: QueryClient) {
  const ui = () => (
    <QueryClientProvider client={qc}>
      <MembersPage />
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, rerenderPage: () => view.rerender(ui()) };
}

function status() {
  return screen.getByRole("status");
}

// "1 MEMBER", "2 MEMBERS MATCHING …" — the line above the grid (the
// rail's "ALL OPERATORS" has no leading count).
function countLine() {
  return screen.getByText(/^\d+ MEMBERS?\b/);
}

describe("/members — keeps the roster while a new key loads (F-260 M10)", () => {
  it("keeps the rows and role counts, dimmed and aria-busy, until the new search lands", async () => {
    getMembers.mockResolvedValueOnce(page([1]));
    const { rerenderPage } = renderPage(client());
    await screen.findByText("member-1");
    expect(screen.getByRole("button", { name: "VALIDATORS · 3" })).toBeInTheDocument();
    expect(status()).toHaveTextContent("");

    const next = deferred<ReturnType<typeof page>>();
    getMembers.mockReturnValueOnce(next.promise);
    state.searchParams = new URLSearchParams("q=ab");
    rerenderPage();

    // In flight: the old roster and its chips are still there…
    await waitFor(() => expect(getMembers).toHaveBeenCalledTimes(2));
    expect(screen.getByText("member-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VALIDATORS · 3" })).toBeInTheDocument();
    expect(screen.queryByText("Loading the roster…")).not.toBeInTheDocument();
    // …marked as updating, for sighted users and for assistive tech…
    const grid = screen.getByTestId("card-grid").parentElement as HTMLElement;
    expect(grid).toHaveAttribute("aria-busy", "true");
    expect(grid.className).toContain("opacity-60");
    expect(status()).toHaveTextContent("Updating the roster…");
    // …and the count line does not claim the old rows match the new search.
    expect(countLine()).not.toHaveTextContent(/MATCHING/);

    await act(async () => {
      next.resolve(page([2], { validator: 1, project: 0, nft: 0, dao: 0 }));
    });

    expect(await screen.findByText("member-2")).toBeInTheDocument();
    expect(screen.queryByText("member-1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VALIDATORS · 1" })).toBeInTheDocument();
    const settled = screen.getByTestId("card-grid").parentElement as HTMLElement;
    expect(settled).toHaveAttribute("aria-busy", "false");
    expect(settled.className).not.toContain("opacity-60");
    expect(status()).toHaveTextContent("");
    expect(countLine()).toHaveTextContent('MATCHING "AB"');
  });

  it("the status region is mounted before it has anything to say, and the text arrives in it", async () => {
    getMembers.mockResolvedValueOnce(page([1]));
    const { rerenderPage } = renderPage(client());
    await screen.findByText("member-1");
    const region = status();
    expect(region).toHaveTextContent("");

    getMembers.mockReturnValueOnce(deferred<ReturnType<typeof page>>().promise);
    state.searchParams = new URLSearchParams("q=ab");
    rerenderPage();

    // Same node, now filled: a region inserted already holding its text
    // is often not announced.
    await waitFor(() => expect(status()).toHaveTextContent("Updating the roster…"));
    expect(status()).toBe(region);
  });

  it("does not show an empty answer to the OLD filters under the new ones", async () => {
    state.searchParams = new URLSearchParams("type=dao");
    getMembers.mockResolvedValueOnce(page([], COUNTS, 0));
    const { rerenderPage } = renderPage(client());
    expect(await screen.findByText("No DAOs on the floor yet.")).toBeInTheDocument();

    getMembers.mockReturnValueOnce(deferred<ReturnType<typeof page>>().promise);
    state.searchParams = new URLSearchParams("type=validator");
    rerenderPage();

    await waitFor(() => expect(getMembers).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("No DAOs on the floor yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("No validators on the floor yet.")).not.toBeInTheDocument();
    expect(screen.getByText("Loading the roster…")).toBeInTheDocument();
    expect(status()).toHaveTextContent("Updating the roster…");
  });

  it("a failed new key still shows the error and the last good pager", async () => {
    getMembers.mockResolvedValueOnce(page([1]));
    const { rerenderPage } = renderPage(client());
    await screen.findByText("member-1");

    getMembers.mockRejectedValueOnce(new BccApiError("bcc_unavailable", "raw", 503, null));
    state.searchParams = new URLSearchParams("page=2");
    rerenderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /roster is temporarily unavailable/i,
    );
    expect(screen.queryByText("member-1")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
    expect(status()).toHaveTextContent("");
  });
});

describe("useMembers — keepPreviousData is opt-in", () => {
  function wrapper(qc: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    };
  }

  it("without the option a new key is pending with no data (other callers unchanged)", async () => {
    getMembers.mockResolvedValueOnce(page([1]));
    const { result, rerender } = renderHook(({ q }) => useMembers({ q }), {
      initialProps: { q: "" },
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    getMembers.mockReturnValueOnce(deferred<ReturnType<typeof page>>().promise);
    rerender({ q: "ab" });

    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it("with the option a new key keeps the previous data as a placeholder", async () => {
    getMembers.mockResolvedValueOnce(page([1]));
    const { result, rerender } = renderHook(
      ({ q }) => useMembers({ q, keepPreviousData: true }),
      { initialProps: { q: "" }, wrapper: wrapper(client()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    getMembers.mockReturnValueOnce(deferred<ReturnType<typeof page>>().promise);
    rerender({ q: "ab" });

    expect(result.current.isPending).toBe(false);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.items).toEqual([{ id: 1 }]);
  });
});
