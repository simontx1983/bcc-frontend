/**
 * UX scan 2026-11-12, groups H5: after joining or leaving, the group's
 * feed and roster stayed stale — they are client queries that stayed
 * mounted, and only `router.refresh()` ran. Every join/leave mutation now
 * refreshes that group's feed (every channel) and roster on success, and
 * the caller's own onSuccess still runs.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ok = vi.hoisted(() => () => Promise.resolve({ ok: true }));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("@/lib/api/my-groups-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  joinPlainGroup: ok,
  leavePlainGroup: ok,
}));
vi.mock("@/lib/api/halls-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  joinHall: ok,
  leaveHall: ok,
}));
vi.mock("@/lib/api/validator-groups-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  joinValidatorGroup: ok,
  leaveValidatorGroup: ok,
}));
vi.mock("@/lib/api/holder-groups-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  joinHolderGroup: ok,
  leaveHolderGroup: ok,
}));

const { useJoinPlainGroupMutation, useLeavePlainGroupMutation } = await import("@/hooks/useMyGroups");
const { useJoinHallMutation, useLeaveHallMutation } = await import("@/hooks/useHallsPrimary");
const { useJoinValidatorGroupMutation, useLeaveValidatorGroupMutation } = await import("@/hooks/useValidatorGroups");
const { useJoinHolderGroupMutation, useLeaveHolderGroupMutation } = await import("@/hooks/useHolderGroups");

type MutationHook = (o: { onSuccess?: (...a: unknown[]) => void }) => { mutateAsync: (id: number) => Promise<unknown> };

const HOOKS: ReadonlyArray<readonly [string, MutationHook]> = [
  ["plain join", useJoinPlainGroupMutation as unknown as MutationHook],
  ["plain leave", useLeavePlainGroupMutation as unknown as MutationHook],
  ["hall join", useJoinHallMutation as unknown as MutationHook],
  ["hall leave", useLeaveHallMutation as unknown as MutationHook],
  ["validator join", useJoinValidatorGroupMutation as unknown as MutationHook],
  ["validator leave", useLeaveValidatorGroupMutation as unknown as MutationHook],
  ["holder join", useJoinHolderGroupMutation as unknown as MutationHook],
  ["holder leave", useLeaveHolderGroupMutation as unknown as MutationHook],
];

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient();
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe("join/leave refreshes the group's feed and roster", () => {
  it.each(HOOKS)("%s", async (_label, useHook) => {
    const spy = vi.spyOn(client, "invalidateQueries");
    const callerOnSuccess = vi.fn();
    const { result } = renderHook(() => useHook({ onSuccess: callerOnSuccess }), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(77);
    });

    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain('["groups","feed",77]');
    expect(keys).toContain('["groups","members",77]');
    expect(callerOnSuccess).toHaveBeenCalledTimes(1);
    expect(callerOnSuccess.mock.calls[0]?.[1]).toBe(77);
  });

  it("the feed prefix reaches every channel of that group, and no other group", async () => {
    client.setQueryData(["groups", "feed", 77, false], { pages: [] });
    client.setQueryData(["groups", "feed", 77, true], { pages: [] });
    client.setQueryData(["groups", "feed", 78, false], { pages: [] });
    const { result } = renderHook(() => useJoinPlainGroupMutation({}), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(77);
    });
    expect(client.getQueryState(["groups", "feed", 77, false])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["groups", "feed", 77, true])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["groups", "feed", 78, false])?.isInvalidated).toBe(false);
  });
});
