import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The badges query keys on the open-thread ids, so opening a thread
 * switches to a NEW query. Without placeholder data the provider's `data`
 * went undefined until that key's first fetch landed, so the bell and
 * inbox counts flashed to 0. The previous payload must carry over.
 */

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

import { BadgesProvider, useBadges, useOpenThreadHint } from "@/hooks/useBadges";

function Counts() {
  const { data } = useBadges();
  return <span data-testid="unread">{data === undefined ? "none" : String(data.notifications_unread)}</span>;
}

function ThreadOpener({ id }: { id: number | null }) {
  useOpenThreadHint(id);
  return null;
}

function Tree({ qc, threadId }: { qc: QueryClient; threadId: number | null }) {
  return (
    <QueryClientProvider client={qc}>
      <BadgesProvider>
        <Counts />
        <ThreadOpener id={threadId} />
      </BadgesProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  getBadges.mockReset();
});

describe("BadgesProvider across an open-thread key change", () => {
  it("keeps the previous counts while the new key's first fetch is in flight", async () => {
    getBadges.mockResolvedValueOnce({
      messages_unread: 2,
      notifications_unread: 7,
      open_thread_hints: {},
      polled_at: "2026-11-10T00:00:00Z",
    });
    // The fetch for the new key never settles inside the test window.
    getBadges.mockImplementation(() => new Promise(() => undefined));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container, rerender } = render(<Tree qc={qc} threadId={null} />);
    const unread = () => within(container).getByTestId("unread").textContent;

    await waitFor(() => expect(unread()).toBe("7"));

    rerender(<Tree qc={qc} threadId={5} />);
    await waitFor(() => expect(getBadges).toHaveBeenCalledTimes(2));

    expect(unread()).toBe("7");
  });
});
