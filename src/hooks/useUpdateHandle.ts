"use client";

/**
 * useUpdateHandle — PATCH /me/handle, then bring every place that shows
 * the handle up to date (F-333).
 *
 * No optimistic update: the handle is the member's public address, and the
 * server owns the cooldown and the conflict check.
 *
 * On a real rename (`next_change_at !== null`):
 *   - the NextAuth session's handle is refreshed. The session wrote it only
 *     at sign-in, so /u/me, the header, the sidebar and every "my" link
 *     kept the old one until sign-out. The refresh asks the server
 *     (lib/auth.ts reads it with the session's own token); it never sends
 *     a handle. `sessionRefreshed` reports whether the echo carries the
 *     new handle, so the UI can be honest if it didn't;
 *   - user and profile queries are invalidated, and the route is refreshed
 *     so server-rendered owner state is recomputed.
 * A no-op (same handle) touches nothing.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { updateHandle } from "@/lib/api/onboarding-endpoints";
import type { BccApiError, HandleUpdateResponse } from "@/lib/api/types";

export interface HandleUpdateResult extends HandleUpdateResponse {
  /** False when the session could not be confirmed to carry the new handle. */
  sessionRefreshed: boolean;
}

export function useUpdateHandle() {
  const queryClient = useQueryClient();
  const { update } = useSession();
  const router = useRouter();

  return useMutation<HandleUpdateResult, BccApiError, string>({
    mutationFn: async (handle) => {
      const saved = await updateHandle(handle);
      if (saved.next_change_at === null) {
        return { ...saved, sessionRefreshed: true };
      }
      let sessionRefreshed = false;
      try {
        const next = (await update({ refreshHandle: true })) as
          | { user?: { handle?: unknown } }
          | null;
        sessionRefreshed = next?.user?.handle === saved.handle;
      } catch {
        sessionRefreshed = false;
      }
      return { ...saved, sessionRefreshed };
    },
    onSuccess: (result) => {
      if (result.next_change_at === null) return;
      void queryClient.invalidateQueries({ queryKey: ["user"] });
      void queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      router.refresh();
    },
  });
}
