/**
 * F-318 M-no3: the badge polls, the notifications list does not. The
 * header mounts the panel only while it is open, so a rise in the unread
 * count while it is CLOSED used to go unnoticed: opening within the list's
 * 30 s staleTime showed a cached list that disagreed with the bell.
 * BadgesProvider now invalidates the list on any rise, open or not.
 */

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "1" } } }),
  getSession: async () => ({ user: { id: "1" } }),
}));

const getBadges = vi.fn();
vi.mock("@/lib/api/me-badges-endpoint", () => ({
  getBadges: (...a: unknown[]) => getBadges(...a),
}));

import { BADGES_QUERY_KEY_ROOT, BadgesProvider, useBadges } from "@/hooks/useBadges";
import { NOTIFICATIONS_QUERY_KEY } from "@/hooks/useNotifications";

const badges = (notifications_unread: number) => ({
  messages_unread: 0,
  notifications_unread,
  open_thread_hints: {},
  polled_at: "2026-11-19T00:00:00Z",
});

function client() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A fresh, cached list, as if the panel had been opened a moment ago.
  qc.setQueryData(NOTIFICATIONS_QUERY_KEY, { pages: [], pageParams: [null] });
  return qc;
}

const listState = (qc: QueryClient) => qc.getQueryState(NOTIFICATIONS_QUERY_KEY);

/** Shows the count the provider has RENDERED (not merely fetched). */
function Seen() {
  const { data } = useBadges();
  return <span data-testid="seen">{data === undefined ? "none" : String(data.notifications_unread)}</span>;
}

/** Wait until the provider has rendered this count. */
const seen = (n: number) => waitFor(() => expect(screen.getByTestId("seen")).toHaveTextContent(String(n)));

async function poll(qc: QueryClient) {
  await act(async () => {
    await qc.refetchQueries({ queryKey: BADGES_QUERY_KEY_ROOT });
  });
}

afterEach(() => {
  cleanup();
  getBadges.mockReset();
});

describe("BadgesProvider keeps the notifications list honest", () => {
  it("a rise in the unread count invalidates the list (panel closed)", async () => {
    getBadges.mockResolvedValueOnce(badges(1)).mockResolvedValueOnce(badges(3));
    const qc = client();
    render(
      <QueryClientProvider client={qc}>
        <BadgesProvider>
          <Seen />
        </BadgesProvider>
      </QueryClientProvider>,
    );
    await seen(1);
    expect(listState(qc)?.isInvalidated).toBe(false);
    await poll(qc);
    await waitFor(() => expect(listState(qc)?.isInvalidated).toBe(true));
  });

  it("the first poll and a fall are not news", async () => {
    getBadges.mockResolvedValueOnce(badges(4)).mockResolvedValueOnce(badges(2));
    const qc = client();
    render(
      <QueryClientProvider client={qc}>
        <BadgesProvider>
          <Seen />
        </BadgesProvider>
      </QueryClientProvider>,
    );
    await seen(4);
    await poll(qc);
    await seen(2);
    expect(listState(qc)?.isInvalidated).toBe(false);
  });

  it("opening the panel after a rise refetches, even within the list's staleTime", async () => {
    getBadges.mockResolvedValueOnce(badges(1)).mockResolvedValueOnce(badges(2));
    const listFetch = vi.fn().mockResolvedValue({ pages: [], pageParams: [null] });
    const qc = client();
    function Panel() {
      useQuery({ queryKey: NOTIFICATIONS_QUERY_KEY, queryFn: listFetch, staleTime: 30_000 });
      return null;
    }
    const tree = (open: boolean) => (
      <QueryClientProvider client={qc}>
        <BadgesProvider>
          <Seen />
          {open ? <Panel /> : null}
        </BadgesProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(tree(false));
    await seen(1);
    await poll(qc); // the rise happens while the panel is closed
    await seen(2);
    rerender(tree(true));
    await waitFor(() => expect(listFetch).toHaveBeenCalledTimes(1));
  });
});
