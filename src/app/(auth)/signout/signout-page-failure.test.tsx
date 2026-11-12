/**
 * M29 (F-263) — a failed sign-out from the /signout page is never silent.
 *
 * The audit read the page alone: on `!result.signedOut` it re-enables the
 * button with no message. But the page renders inside PrivateRenderGate,
 * and the teardown closes that gate before any await and leaves it closed
 * on failure, recording the failed result. The gate then replaces the whole
 * app — this page included — with its "Almost signed out" recovery panel
 * and a "Finish signing out" control. Pinned here end to end with the real
 * boundary and gate, so a change that reopened the gate on failure (and
 * exposed the silent page) fails loudly.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/signout",
  useSearchParams: () => new URLSearchParams(),
}));

const boundary = await import("@/lib/auth/session-boundary");
const { PrivateRenderGate } = await import("@/components/auth/PrivateRenderGate");
const { default: SignoutPage } = await import("@/app/(auth)/signout/page");

function register(signOut: () => Promise<void>) {
  boundary.registerSessionTeardown({
    purgeQueryCache: () => {},
    purgeViewerStorage: () => "cleared",
    purgeArrivalStorage: () => "cleared",
    invalidateQueryCache: () => {},
    revokePush: async () => "not-subscribed",
    revokeToken: async () => true,
    signOut,
  });
}

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
beforeEach(() => boundary.__resetSessionBoundaryForTests());
afterEach(() => boundary.__resetSessionBoundaryForTests());

describe("/signout — sign-out fails", () => {
  it("replaces the page with the 'Almost signed out' recovery panel", async () => {
    register(async () => {
      throw new Error("network");
    });
    render(
      <PrivateRenderGate>
        <SignoutPage />
      </PrivateRenderGate>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    });

    expect(await screen.findByText("Almost signed out")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn.t reach the server/i);
    expect(screen.getByRole("button", { name: /finish signing out/i })).toBeInTheDocument();
    // The page's own (re-enabled) controls are not what the viewer sees.
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
