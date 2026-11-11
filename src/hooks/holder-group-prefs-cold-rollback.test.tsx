import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * useUpdateHolderGroupPreferences writes `auto_join` optimistically. With
 * a warm cache, onError restored the snapshot; with a COLD cache there was
 * no snapshot and onError did nothing, so a refused toggle left the
 * optimistic value in the cache as if it had been saved.
 */

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));

const updateHolderGroupPreferences = vi.fn();
vi.mock("@/lib/api/holder-groups-endpoints", () => ({
  getHolderGroupPreferences: vi.fn(),
  getMyHolderGroups: vi.fn(),
  joinHolderGroup: vi.fn(),
  leaveHolderGroup: vi.fn(),
  updateHolderGroupPreferences: (...a: unknown[]) => updateHolderGroupPreferences(...a),
}));

import {
  HOLDER_GROUPS_PREFS_QUERY_KEY,
  useUpdateHolderGroupPreferences,
} from "@/hooks/useHolderGroups";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("useUpdateHolderGroupPreferences rollback", () => {
  it("clears the optimistic value on error when the cache was cold", async () => {
    updateHolderGroupPreferences.mockRejectedValue(new Error("boom"));
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useUpdateHolderGroupPreferences(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ auto_join: true }).catch(() => undefined);
    });

    expect(qc.getQueryData(HOLDER_GROUPS_PREFS_QUERY_KEY)).toBeUndefined();
  });

  it("control: restores the snapshot on error when the cache was warm", async () => {
    updateHolderGroupPreferences.mockRejectedValue(new Error("boom"));
    const { qc, wrapper } = setup();
    qc.setQueryData(HOLDER_GROUPS_PREFS_QUERY_KEY, { auto_join: false });
    const { result } = renderHook(() => useUpdateHolderGroupPreferences(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ auto_join: true }).catch(() => undefined);
    });

    expect(qc.getQueryData(HOLDER_GROUPS_PREFS_QUERY_KEY)).toEqual({ auto_join: false });
  });
});
