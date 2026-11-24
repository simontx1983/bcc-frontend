/**
 * The validator ownership bell kinds (validator admin V1, PR B3).
 *
 * `bcc_validator_ownership_granted` and `bcc_validator_ownership_removed`
 * are bell-only member kinds: each gets one bell toggle, but ONLY once the
 * server's prefs carry its key. Against a server without the validator
 * bells, a row would be a toggle the server drops on save. The three admin
 * broadcast kinds never get a toggle. Fixtures only.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationPrefs } from "@/lib/api/types";

const mutate = vi.hoisted(() => vi.fn());
// One stable object per fixture: a fresh object on every render would read
// as new server data each time and re-seed the form's draft endlessly.
const state = vi.hoisted(() => ({ prefs: null as unknown }));

function setBell(bell: Record<string, boolean>): void {
  const next: NotificationPrefs = {
    email_digest: false,
    bell: bell as NotificationPrefs["bell"],
    push: { enabled: true, events: {} as NotificationPrefs["push"]["events"] },
    push_available: true,
  };
  state.prefs = next;
}

vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => ({
    data: state.prefs as NotificationPrefs,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateNotificationPrefs: () => ({ mutate, isPending: false }),
}));
vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    isSupported: true,
    isReady: true,
    browserSubscribed: true,
    enable: { isPending: false, isError: false, error: null, mutate: vi.fn() },
    disable: { isPending: false, isError: false, error: null, mutate: vi.fn() },
    removeThisDevice: { isPending: false, isError: false, error: null, mutate: vi.fn() },
  }),
}));

import { NotificationPrefsForm } from "@/components/settings/NotificationPrefsForm";

const ROWS = [
  { key: "bcc_validator_ownership_granted", label: "Validator page ownership granted" },
  { key: "bcc_validator_ownership_removed", label: "Validator page ownership removed" },
] as const;

const MEMBER_KEYS = { bcc_validator_ownership_granted: true, bcc_validator_ownership_removed: true };
const ADMIN_KEYS = {
  bcc_validator_owner_linked: true,
  bcc_validator_owner_revoked: true,
  bcc_validator_owner_link_cancelled: true,
};

beforeEach(() => {
  mutate.mockReset();
  setBell({ ...MEMBER_KEYS });
});
afterEach(cleanup);

describe("validator ownership bell preferences", () => {
  it("each appears exactly once when the server sends its key, and never as a push toggle", () => {
    render(<NotificationPrefsForm />);
    // The push section is rendering its event rows, or this proves nothing.
    expect(screen.getByRole("heading", { name: "Browser push" })).toBeInTheDocument();
    for (const row of ROWS) {
      expect(screen.getAllByText(row.label)).toHaveLength(1);
    }
  });

  it.each(ROWS)("$key saves as a bell preference and nothing else", ({ key, label }) => {
    render(<NotificationPrefsForm />);
    const toggle = screen.getByRole("checkbox", { name: new RegExp(label) });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ bell: { [key]: false } });
  });

  it("a server whose prefs lack the keys (no validator bells yet) shows neither row", () => {
    setBell({});
    render(<NotificationPrefsForm />);
    for (const row of ROWS) {
      expect(screen.queryByText(row.label)).toBeNull();
    }
  });

  it("the server's value is shown, not the default", () => {
    setBell({ ...MEMBER_KEYS, bcc_validator_ownership_removed: false });
    render(<NotificationPrefsForm />);
    expect(screen.getByRole("checkbox", { name: new RegExp(ROWS[1].label) })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: new RegExp(ROWS[0].label) })).toBeChecked();
  });

  it("the three admin kinds never get a toggle, even when the server sends them", () => {
    render(<NotificationPrefsForm />);
    const without = screen.getAllByRole("checkbox").length;
    cleanup();

    setBell({ ...MEMBER_KEYS, ...ADMIN_KEYS });
    render(<NotificationPrefsForm />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(without);
    expect(screen.queryByText(/owner linked|owner revoked|link cancelled/i)).toBeNull();
  });
});
