/**
 * After a successful save the notification form adopts what the server
 * SAVED, so it is clean right after "Saved" even when the server
 * normalised a value instead of taking the one sent (review LOW on H4).
 *
 * With only the H4 rebase, a just-sent value counts as the member's edit;
 * if the server echoed something else, the draft kept the sent value and
 * the form stayed dirty — Save live, unsaved-changes guard armed — right
 * after a successful save.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationPrefs, NotificationPrefsPatch } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  prefs: null as unknown,
  onSuccess: null as null | ((d: unknown) => void),
}));
const mutate = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => ({
    data: state.prefs,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateNotificationPrefs: (opts: { onSuccess?: (d: unknown) => void }) => {
    state.onSuccess = opts.onSuccess ?? null;
    return { mutate, isPending: false };
  },
}));
const idle = { isPending: false, isError: false, error: null, mutate: vi.fn() };
vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    isSupported: true,
    isReady: true,
    browserSubscribed: false,
    enable: idle,
    disable: idle,
    removeThisDevice: idle,
  }),
}));
vi.mock("@/hooks/useDirtyRegistration", () => ({ useDirtyRegistration: () => {} }));

const { NotificationPrefsForm } = await import("@/components/settings/NotificationPrefsForm");

const BEFORE: NotificationPrefs = {
  email_digest: false,
  bell: { bcc_claim_badge_removed: true } as NotificationPrefs["bell"],
  push: { enabled: false, events: {} as NotificationPrefs["push"]["events"] },
  push_available: true,
};

afterEach(cleanup);

describe("NotificationPrefsForm — a save adopts the server's answer", () => {
  it("is clean after a save whose response differs from what was sent", () => {
    state.prefs = BEFORE;
    const view = render(<NotificationPrefsForm />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Claim badge removed/ }));
    const save = screen.getByRole("button", { name: /save/i });
    fireEvent.click(save);
    expect(mutate).toHaveBeenCalledWith({
      bell: { bcc_claim_badge_removed: false },
    } satisfies NotificationPrefsPatch);

    // The server keeps the event ON (normalised) and says so. The real
    // hook primes the cache with the same object before onSuccess.
    const saved: NotificationPrefs = { ...BEFORE, bell: { ...BEFORE.bell } };
    state.prefs = saved;
    view.rerender(<NotificationPrefsForm />);
    state.onSuccess?.(saved);
    view.rerender(<NotificationPrefsForm />);

    expect(screen.getByRole("checkbox", { name: /Claim badge removed/ })).toBeChecked();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
});
