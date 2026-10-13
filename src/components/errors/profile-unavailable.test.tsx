/**
 * The profile segment's two non-404 failure states.
 *
 * ## What this pins
 *
 * Before this change, `/u/[handle]/page.tsx` rethrew every non-404 and
 * nothing in the `(main)` tree caught it, so it reached
 * `app/global-error.tsx`. Measured against a recording API stub,
 * injecting a failure on `GET /users/member1`:
 *
 *   injected 403 / 500 / 429  ->  "Application error: a client-side
 *                                  exception has occurred"
 *                                  chrome gone, 0 retry controls,
 *                                  0 in-app links
 *
 * One dead end for three different problems.
 *
 * ## Why the controls are shaped this way
 *
 * Asserting "a retry button renders" alone would pass against a version
 * that offers retry on a 403 too — which is the actual bug this is
 * guarding, and which `LoadFailure`'s own docblock calls a lie. So the
 * denied case asserts the ABSENCE of a retry control even when a caller
 * passes `onRetry`, and both cases assert an exit exists.
 *
 * The copy assertions are not decoration either: "doesn't exist" for a
 * failed read is a false statement about the subject, and "right now" on
 * a terminal denial is a promise the state cannot keep.
 */

import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ProfileUnavailable,
  type ProfileUnavailableReason,
} from "@/components/errors/ProfileUnavailable";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderReason(reason: ProfileUnavailableReason, onRetry?: () => void) {
  const { container } = render(
    <ProfileUnavailable reason={reason} {...(onRetry ? { onRetry } : {})} />,
  );
  return within(container);
}

describe("a confirmed denial", () => {
  it("offers NO retry control, even when the caller passes one", () => {
    const onRetry = vi.fn();
    const ui = renderReason("denied", onRetry);

    expect(ui.queryByRole("button", { name: /retry|try again/i })).toBeNull();
    // Not merely disabled — absent. A disabled Retry still tells the
    // viewer retrying is the shape of the answer.
    expect(ui.queryAllByRole("button")).toHaveLength(0);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("does not claim the profile is nonexistent", () => {
    const ui = renderReason("denied");
    const alert = ui.getByRole("alert").textContent ?? "";

    expect(alert).toMatch(/isn't available to you/i);
    expect(alert).not.toMatch(/not found|doesn't exist|does not exist|no such/i);
  });

  it("does not promise a later success", () => {
    const ui = renderReason("denied");
    const alert = ui.getByRole("alert").textContent ?? "";
    expect(alert).not.toMatch(/right now|shortly|try again|moment/i);
  });

  it("still gives the viewer a real exit", () => {
    const ui = renderReason("denied");
    const nav = ui.getByRole("navigation", { name: /where to go instead/i });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/members");
  });
});

describe("a temporary failure", () => {
  it("offers a retry that calls back", () => {
    const onRetry = vi.fn();
    const ui = renderReason("temporary", onRetry);

    const retry = ui.getByRole("button", { name: /retry/i });
    retry.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders no retry control when the caller has nothing to call", () => {
    // The boundary always has `reset`, but a future server-rendered
    // caller may not — and an inert button would be the same lie.
    const ui = renderReason("temporary");
    expect(ui.queryAllByRole("button")).toHaveLength(0);
  });

  it("says it is temporary, and does not claim nonexistence either", () => {
    const ui = renderReason("temporary", vi.fn());
    const alert = ui.getByRole("alert").textContent ?? "";

    expect(alert).toMatch(/temporarily unavailable/i);
    expect(alert).not.toMatch(/not found|doesn't exist|no such/i);
  });

  it("still gives the viewer an exit when retrying keeps failing", () => {
    const ui = renderReason("temporary", vi.fn());
    const nav = ui.getByRole("navigation", { name: /where to go instead/i });
    expect(within(nav).getAllByRole("link").length).toBeGreaterThan(0);
  });
});

describe("neither state leaks why", () => {
  it.each<ProfileUnavailableReason>(["denied", "temporary"])(
    "%s renders no server-supplied detail",
    (reason) => {
      const ui = renderReason(reason, vi.fn());
      const text = ui.getByRole("alert").textContent ?? "";
      // The backend's own 403 message for this route is a moderation
      // state on someone else's account. The component takes no message
      // prop at all, so there is nothing to render — this asserts the
      // consequence rather than the mechanism.
      expect(text).not.toMatch(/suspend|banned|blocked|moderat|account/i);
    },
  );
});
