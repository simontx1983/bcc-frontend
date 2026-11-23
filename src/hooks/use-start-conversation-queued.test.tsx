/**
 * F-319 (L-me2): a send parked in an unclaimed page's queue shows on the
 * Queued tab, so useStartConversationMutation re-reads the queued list on
 * that branch. A delivered send doesn't touch it. The real hook against a
 * real QueryClient; only the endpoint is stubbed.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ startConversation: vi.fn() }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("@/lib/api/messages-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  startConversation: (...a: unknown[]) => api.startConversation(...a),
}));

import { useStartConversationMutation } from "@/hooks/useStartConversation";
import { QUEUED_MESSAGES_QUERY_KEY_ROOT } from "@/hooks/useQueuedMessages";

let client: QueryClient;
beforeEach(() => {
  api.startConversation.mockReset();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const invalidatedQueued = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.some(
    (c: unknown[]) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey) === JSON.stringify(QUEUED_MESSAGES_QUERY_KEY_ROOT),
  );

describe("useStartConversationMutation and the Queued tab", () => {
  it("a queued send re-reads the queued list", async () => {
    api.startConversation.mockResolvedValue({ queued: true, message_id: 9 });
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useStartConversationMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ page_id: 3, body: "hi" });
    });
    expect(invalidatedQueued(spy)).toBe(true);
  });

  it("a delivered send leaves it alone", async () => {
    api.startConversation.mockResolvedValue({ conversation_id: 77 });
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useStartConversationMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ recipient_id: 3, body: "hi" });
    });
    expect(invalidatedQueued(spy)).toBe(false);
    // The inbox still re-reads either way.
    expect(spy.mock.calls.some((c: unknown[]) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey) === '["conversations"]')).toBe(true);
  });
});
