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

    expect(ui.queryByRole("button", { name: /reload this page/i })).toBeNull();
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

    const retry = ui.getByRole("button", { name: /reload this page/i });
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

describe("the recovery is named a RELOAD, and warns before it is pressed", () => {
  // Measured with the RSC transport aborted: pressing it produced ONE
  // HARD DOCUMENT LOAD and a `window`-scoped sentinel was destroyed. The
  // control cannot know in advance which it will be, so it must not
  // promise the gentler one.
  it("does not call itself a retry", () => {
    const ui = renderReason("temporary", vi.fn());
    expect(ui.queryByRole("button", { name: /^retry$/i })).toBeNull();
    expect(ui.getByRole("button", { name: /reload this page/i })).toBeTruthy();
  });

  it("shows the warning BEFORE activation, not after", () => {
    const onRetry = vi.fn();
    const ui = renderReason("temporary", onRetry);
    const warning = ui.getByTestId("profile-reload-warning");
    expect(warning.textContent ?? "").toMatch(/discard anything you haven.t saved/i);
    // Present without anyone having pressed anything.
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("ties the warning to the control for assistive technology", () => {
    const ui = renderReason("temporary", vi.fn());
    const btn = ui.getByRole("button", { name: /reload this page/i });
    const described = btn.getAttribute("aria-describedby");
    expect(described).not.toBeNull();
    expect(ui.getByTestId("profile-reload-warning").id).toBe(described);
  });

  it("offers no reload — and no warning — on a confirmed denial", () => {
    const ui = renderReason("denied", vi.fn());
    expect(ui.queryByRole("button", { name: /reload this page/i })).toBeNull();
    expect(ui.queryByTestId("profile-reload-warning")).toBeNull();
  });

  it("keeps the no-cost exit beside the reload", () => {
    // Leaving cannot discard work the reload might, so it must stay
    // reachable next to the action that can.
    const ui = renderReason("temporary", vi.fn());
    const nav = ui.getByRole("navigation", { name: /where to go instead/i });
    expect(within(nav).getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("is reachable and operable from the keyboard", () => {
    const onRetry = vi.fn();
    const ui = renderReason("temporary", onRetry);
    const btn = ui.getByRole("button", { name: /reload this page/i });
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(btn).not.toBeDisabled();
    btn.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("reports busy without disabling, so focus is never taken away", () => {
    const { container } = render(
      <ProfileUnavailable reason="temporary" onRetry={vi.fn()} isBusy />,
    );
    const ui = within(container);
    const btn = ui.getByRole("button", { name: /reload this page/i });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
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
