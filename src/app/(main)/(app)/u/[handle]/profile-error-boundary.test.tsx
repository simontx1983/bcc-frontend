/**
 * The profile-segment boundary's Retry must actually re-attempt.
 *
 * ## The defect this pins
 *
 * The first version of this boundary called Next's `reset()` and nothing
 * else. `reset()` re-renders the boundary subtree from what the client
 * already holds; the failure happened during the SERVER render, so there
 * was no fresh payload and nothing re-requested. Measured against a
 * recording API stub, injecting a 500 on the profile read and pressing
 * Retry:
 *
 *   newUpstreamReads: 0      recovered: false
 *
 * A Retry that cannot re-attempt is the same lie as a Retry on a 403.
 *
 * ## Why the control is here
 *
 * Asserting "reset was called" would have PASSED against the broken
 * version — that is precisely what it did. So the assertion is that
 * `router.refresh()` is called, which is the half that actually
 * re-requests, and that both run in one transition.
 */

import { cleanup, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import ProfileError from "./error";

beforeEach(() => {
  refresh.mockReset();
  captureException.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBoundary() {
  const reset = vi.fn();
  const error = Object.assign(new Error("An error occurred in the Server Components render."), {
    digest: "123456789",
  });
  const { container } = render(<ProfileError error={error} reset={reset} />);
  return { ui: within(container), reset, error };
}

describe("the boundary's Retry", () => {
  it("re-runs the server render, not just the client subtree", () => {
    const { ui, reset } = renderBoundary();

    ui.getByRole("button", { name: /retry/i }).click();

    // The half that actually re-requests.
    expect(refresh).toHaveBeenCalledTimes(1);
    // And the half that clears the error so the fresh tree can mount.
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("offers exactly one retry control and a real exit", () => {
    const { ui } = renderBoundary();
    expect(ui.getAllByRole("button", { name: /retry/i })).toHaveLength(1);
    const nav = ui.getByRole("navigation", { name: /where to go instead/i });
    expect(within(nav).getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("does not re-attempt while a retry is already running", () => {
    // Measured against a recording API stub: three rapid presses produced
    // FOUR upstream reads where one press produces two. `isPending` marks
    // the transition but does not block a second press by itself.
    const { ui, reset } = renderBoundary();
    const btn = ui.getByRole("button", { name: /retry/i });

    btn.click();
    btn.click();
    btn.click();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("allows a fresh attempt once a NEW failure arrives", () => {
    // The clear is load-bearing: a retry that also fails must be
    // retryable. Without it, one press per mount and then nothing.
    const reset = vi.fn();
    const first = Object.assign(new Error("first"), { digest: "d1" });
    const view = render(<ProfileError error={first} reset={reset} />);

    view.container.querySelector("button")?.click();
    expect(refresh).toHaveBeenCalledTimes(1);

    const second = Object.assign(new Error("second"), { digest: "d2" });
    view.rerender(<ProfileError error={second} reset={reset} />);
    view.container.querySelector("button")?.click();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("keeps the retry control focusable rather than disabling it", () => {
    // Disabling the control the viewer just pressed would drop focus to
    // <body> — the same defect PagerNav's chips had.
    const { ui } = renderBoundary();
    const btn = ui.getByRole("button", { name: /retry/i });
    btn.focus();
    btn.click();
    expect(btn).not.toBeDisabled();
    expect(document.activeElement).toBe(btn);
  });
});

describe("the boundary's reporting and copy", () => {
  it("reports the error to Sentry", () => {
    const { error } = renderBoundary();
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("renders none of the error's own text, and does not claim nonexistence", () => {
    const { ui } = renderBoundary();
    const alert = ui.getByRole("alert").textContent ?? "";

    expect(alert).toMatch(/temporarily unavailable/i);
    // Next redacts a server error's message in production, but in dev it
    // is the real one — so the boundary must not render it in either case.
    expect(alert).not.toMatch(/Server Components|An error occurred/i);
    expect(ui.queryByText(/123456789/)).toBeNull();
    expect(alert).not.toMatch(/not found|doesn't exist|no such/i);
  });
});
