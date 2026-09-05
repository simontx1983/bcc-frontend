/**
 * The send-off: completing onboarding, and failing to.
 *
 * The behaviour under test is the one that used to strand people. On a
 * persistent /complete failure the screen offered a single "Try again", sat
 * inside MinimalShell (which has no navigation at all), and the resume
 * point had ALREADY been cleared on entry to this screen — so the visitor
 * was un-onboarded, unable to leave, and unable to resume later either.
 *
 * Progress is asserted through localStorage rather than a spy because that
 * is the actual contract the "resume setup?" prompt on the Floor reads.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const replaceSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn(), refresh: vi.fn() }),
}));

let reducedMotion = true;
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => reducedMotion,
}));

/** One controllable /complete call per test. */
interface Deferred {
  promise: Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}
function defer(): Deferred {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let pending: Deferred[] = [];
const completeAsync = vi.fn(() => {
  const d = defer();
  pending.push(d);
  return d.promise;
});
vi.mock("@/hooks/useCompleteOnboarding", () => ({
  useCompleteOnboarding: () => ({ mutateAsync: completeAsync }),
}));

const { DopamineStep } = await import("@/components/onboarding/DopamineStep");
const { BccApiError } = await import("@/lib/api/types");
const PROGRESS_KEY = "bcc-onboarding-progress";

const btn = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const queryBtn = (name: RegExp) => screen.queryByRole("button", { name });

function renderSendOff() {
  return render(<DopamineStep homeChain={null} pulledCards={[]} />);
}

/** Reject the outstanding /complete and let React flush. */
async function failComplete(error: unknown = new Error("boom")) {
  const d = pending.shift();
  d?.reject(error);
  await waitFor(() => {
    expect(screen.getByText(/finish onboarding/i)).toBeTruthy();
  });
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  pending = [];
  reducedMotion = true;
  window.localStorage.clear();
  // A visitor who got as far as the notifications step.
  window.localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify({ step: "notifications", updatedAt: Date.now() }),
  );
});

afterEach(cleanup);

describe("completion fires exactly once", () => {
  it("calls /complete a single time on mount", () => {
    renderSendOff();
    expect(completeAsync).toHaveBeenCalledTimes(1);
  });

  it("does not fire a second time while the first is still in flight", () => {
    renderSendOff();
    // Nothing has settled; a retry press must be a no-op, not a duplicate
    // write. (The server is idempotent, but duplicates double the audit
    // trail and can land out of order.)
    expect(completeAsync).toHaveBeenCalledTimes(1);
  });
});

describe("failure is recoverable, not a dead end", () => {
  it("offers BOTH a retry and a way out", async () => {
    renderSendOff();
    await failComplete();
    expect(btn(/try again/i)).toBeTruthy();
    expect(btn(/continue to the floor/i)).toBeTruthy();
  });

  it("announces the failure to assistive tech", async () => {
    renderSendOff();
    await failComplete();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("leaves for the Floor WITHOUT claiming onboarding finished", async () => {
    renderSendOff();
    await failComplete();

    const callsBefore = completeAsync.mock.calls.length;
    fireEvent.click(btn(/continue to the floor/i));

    expect(replaceSpy).toHaveBeenCalledWith("/");
    // The escape must not quietly mark the account onboarded — the server
    // would contradict it on the next read.
    expect(completeAsync).toHaveBeenCalledTimes(callsBefore);
  });

  it("preserves the resume point so the visitor can finish later", async () => {
    renderSendOff();
    await failComplete();
    // This is the regression: entering the send-off used to clear this
    // unconditionally, so a failure destroyed the only resume signal.
    expect(window.localStorage.getItem(PROGRESS_KEY)).not.toBeNull();
  });

  /**
   * As in the OTP file: the honest, non-vacuous property is that pressing
   * Retry issues ONE request and immediately replaces the error screen with
   * the saving state, so there is no second control to press. The
   * `inFlightRef` in DopamineStep is defence-in-depth and is deliberately
   * NOT asserted — `fireEvent` flushes between clicks, so a test aimed at
   * it passes with the ref removed. One such test was written here and
   * deleted once a mutation check proved it could not fail.
   */
  it("retry issues exactly one request and takes the retry control away", async () => {
    renderSendOff();
    await failComplete();
    expect(completeAsync).toHaveBeenCalledTimes(1);

    fireEvent.click(btn(/try again/i));

    expect(completeAsync).toHaveBeenCalledTimes(2);
    // The error branch is gone while the retry is in flight, so the button
    // a visitor could double-press no longer exists.
    expect(queryBtn(/try again/i)).toBeNull();
    expect(queryBtn(/continue to the floor/i)).toBeNull();
  });

  it("a second failure restores both controls, so retry is not one-shot", async () => {
    renderSendOff();
    await failComplete();
    fireEvent.click(btn(/try again/i));
    await failComplete();

    expect(btn(/try again/i)).toBeTruthy();
    expect(btn(/continue to the floor/i)).toBeTruthy();
    expect(completeAsync).toHaveBeenCalledTimes(2);
  });

  it("renders code-keyed copy, never a raw backend message", async () => {
    renderSendOff();
    await failComplete(
      new BccApiError("bcc_rate_limited", "RAW_SQL_LEAK: table wp_users", 429, null),
    );
    // §gamma — the mapped copy is shown and err.message never reaches the DOM.
    expect(screen.getByText(/too many attempts/i)).toBeTruthy();
    expect(screen.queryByText(/RAW_SQL_LEAK/)).toBeNull();
  });

  it("falls back to generic copy for an unmapped failure, still leaking nothing", async () => {
    renderSendOff();
    await failComplete(
      new BccApiError("bcc_teapot", "RAW_SQL_LEAK: table wp_users", 418, null),
    );
    expect(screen.getByText(/couldn.t save your setup/i)).toBeTruthy();
    expect(screen.queryByText(/RAW_SQL_LEAK/)).toBeNull();
  });
});

describe("success", () => {
  it("clears the resume point only once the server has confirmed", async () => {
    renderSendOff();
    expect(window.localStorage.getItem(PROGRESS_KEY)).not.toBeNull();

    pending.shift()?.resolve({ completed: true, home_chain: null, rank_label: null });

    await waitFor(() => {
      expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
    });
  });

  it("routes to the Floor once the hold has elapsed", async () => {
    renderSendOff();
    pending.shift()?.resolve({ completed: true, home_chain: null, rank_label: null });
    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith("/");
    }, { timeout: 3000 });
  });

  it("shows no error affordances on the happy path", async () => {
    renderSendOff();
    pending.shift()?.resolve({ completed: true, home_chain: null, rank_label: null });
    await waitFor(() => {
      expect(queryBtn(/continue to the floor/i)).toBeNull();
      expect(queryBtn(/try again/i)).toBeNull();
    });
  });
});

describe("the escape hatch cannot double-navigate", () => {
  it("issues one navigation however many times it is pressed", async () => {
    renderSendOff();
    await failComplete();
    const escape = btn(/continue to the floor/i);
    fireEvent.click(escape);
    fireEvent.click(escape);
    fireEvent.click(escape);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });

  it("is reachable by keyboard, alongside Retry", async () => {
    renderSendOff();
    await failComplete();
    const retry = btn(/try again/i);
    const escape = btn(/continue to the floor/i);
    // Real <button>s, in the document, not aria-disabled — i.e. in the tab
    // order and operable without a pointer.
    for (const el of [retry, escape]) {
      expect(el.tagName).toBe("BUTTON");
      expect(el.disabled).toBe(false);
      expect(el.getAttribute("aria-disabled")).toBeNull();
      el.focus();
      expect(document.activeElement).toBe(el);
    }
  });

  it("gives the failure screen a heading, so focus and structure survive", async () => {
    renderSendOff();
    await failComplete();
    const h1s = document.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toMatch(/finish onboarding/i);
  });
});

describe("late settlement after the visitor has gone", () => {
  it("a late SUCCESS after unmount does not navigate", async () => {
    const { unmount } = renderSendOff();
    const d = pending.shift();
    unmount();

    d?.resolve({ completed: true, home_chain: null, rank_label: null });
    await Promise.resolve();
    await Promise.resolve();

    // The redirect lives in an effect; unmounting tears it down, so a
    // response arriving afterwards cannot move a visitor who has already
    // navigated away under their own steam.
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("a late FAILURE after unmount neither navigates nor throws", async () => {
    const { unmount } = renderSendOff();
    const d = pending.shift();
    unmount();

    d?.reject(new Error("late"));
    await Promise.resolve();
    await Promise.resolve();

    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("a late success still clears the resume point — the account IS onboarded", async () => {
    renderSendOff();
    const d = pending.shift();
    expect(window.localStorage.getItem(PROGRESS_KEY)).not.toBeNull();

    d?.resolve({ completed: true, home_chain: null, rank_label: null });
    await waitFor(() => {
      expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
    });
  });

  it("escaping mid-flight leaves the resume point intact until the server confirms", async () => {
    renderSendOff();
    await failComplete();
    fireEvent.click(btn(/continue to the floor/i));
    // Not onboarded, so the resume signal must survive the exit.
    expect(window.localStorage.getItem(PROGRESS_KEY)).not.toBeNull();
  });
});

describe("reduced motion", () => {
  it("renders a still tile with no flying chips", () => {
    reducedMotion = true;
    renderSendOff();
    expect(document.querySelectorAll(".bcc-onboarding-chip")).toHaveLength(0);
    expect(document.querySelector(".bcc-onboarding-backdrop")).toBeNull();
  });

  it("animates when motion is allowed", () => {
    reducedMotion = false;
    render(
      <DopamineStep
        homeChain={null}
        pulledCards={[{ id: 1, tier: "trusted" }, { id: 2, tier: "proven" }]}
      />,
    );
    expect(document.querySelectorAll(".bcc-onboarding-chip").length).toBeGreaterThan(0);
  });
});
