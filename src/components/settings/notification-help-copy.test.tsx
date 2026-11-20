/**
 * F-262 M21 — the notification settings help text is written for members,
 * not developers. It used to explain the plumbing ("Per-attestor debounce
 * coalesces rapid bursts", "proves the bell channel works", "Ask an
 * administrator to generate VAPID keys"). Rendered with the push section
 * open, so both the bell and the push rows are read.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationPrefs } from "@/lib/api/types";

const PREFS: NotificationPrefs = {
  email_digest: false,
  bell: {} as NotificationPrefs["bell"],
  push: { enabled: true, events: {} as NotificationPrefs["push"]["events"] },
  push_available: true,
};

vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => ({
    data: PREFS,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateNotificationPrefs: () => ({ mutate: vi.fn(), isPending: false }),
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

afterEach(cleanup);

/** Words that describe the plumbing rather than what the member gets. */
const DEVELOPER_TERMS = [
  /debounce/i,
  /coalesce/i,
  /\bVAPID\b/,
  /\battestor\b/i,
  /audit-trail/i,
  /\btoast\b/i,
  /bell channel/i,
  /adjudication/i,
  /high-conviction/i,
  /state[- ]change/i,
  /\bnudge\b/i,
  /refresh signal/i,
  /\bdesignated\b/i,
];

describe("notification settings help text (M21)", () => {
  it("reads as plain help, with no developer terms, across the bell and push rows", () => {
    render(<NotificationPrefsForm />);
    // Both sections are on screen, or this proves nothing.
    expect(screen.getByRole("heading", { name: "Browser push" })).toBeInTheDocument();
    expect(screen.getByText("Push when someone backs you.")).toBeInTheDocument();
    expect(screen.getByText("You moved up to a new rank.")).toBeInTheDocument();

    const text = document.body.textContent ?? "";
    expect(text.length).toBeGreaterThan(2000);
    expect(DEVELOPER_TERMS.filter((re) => re.test(text)).map(String)).toEqual([]);
  });

  it("the 'push not configured' error tells the member, not an administrator, what is wrong", () => {
    // Only shown after a failed enable, so it is read from the source: the
    // copy map is a plain object literal in the component.
    const src = readFileSync(resolve(process.cwd(), "src/components/settings/NotificationPrefsForm.tsx"), "utf-8");
    expect(src).toMatch(/bcc_push_not_configured:\s*"Push isn't configured on this site yet\."/);
    expect(src).not.toMatch(/generate VAPID keys/);
  });
});
