/**
 * The last escape hatch of a security boundary, so its failure modes
 * matter more than its happy path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forceSignOutNavigation } from "@/lib/auth/force-signout";
import {
  __resetSessionBoundaryForTests,
  setPendingAuthNotice,
} from "@/lib/auth/session-boundary";

let submit: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetSessionBoundaryForTests();
  submit = vi.fn();
  assign = vi.fn();
  reload = vi.fn();
  Object.defineProperty(window, "location", {
    value: { assign, reload, href: "http://localhost/", pathname: "/" },
    writable: true,
  });
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = realCreate(tag) as HTMLElement;
    if (tag === "form") {
      // Cast through unknown: vi.fn()'s type is a Mock, not the exact
      // `() => void` HTMLFormElement.submit declares.
      (el as HTMLFormElement).submit = submit as unknown as () => void;
    }
    return el;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const csrfOk = () =>
  vi.fn(async () =>
    new Response(JSON.stringify({ csrfToken: "tok-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("forceSignOutNavigation", () => {
  it("POSTs a form carrying the csrf token", async () => {
    vi.stubGlobal("fetch", csrfOk());
    await forceSignOutNavigation();
    expect(submit).toHaveBeenCalledTimes(1);
    const form = (document.createElement as unknown as ReturnType<typeof vi.fn>).mock
      .results.map((r) => r.value as HTMLElement)
      .find((el) => el.tagName === "FORM") as HTMLFormElement;
    expect(form.method.toUpperCase()).toBe("POST");
    const fields = [...form.querySelectorAll("input")].map((i) => [i.name, i.value]);
    expect(fields).toEqual(
      expect.arrayContaining([["csrfToken", "tok-1"], ["callbackUrl", "/"]]),
    );
  });

  it("falls back to a real page when the csrf fetch REJECTS", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    await forceSignOutNavigation();
    expect(submit).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/signout");
  });

  it("falls back when the csrf fetch HANGS, rather than dying silently", async () => {
    // This is the whole point. The panel offering this control exists
    // because the sign-out POST timed out, and /api/auth/csrf is the same
    // route handler on the same host — so it hangs too. A hanging fetch
    // never rejects, so without the abort signal the catch is unreachable
    // and the button is silently dead.
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("timeout", "TimeoutError"));
          });
        }),
      ),
    );
    const p = forceSignOutNavigation();
    await vi.advanceTimersByTimeAsync(3_100);
    await p;
    vi.useRealTimers();
    expect(assign).toHaveBeenCalledWith("/signout");
  });

  it("reloads instead of looping when already on the fallback page", async () => {
    // /signout sits inside the render gate, so it can BE the page showing
    // this control; assigning the same path there is a no-op.
    Object.defineProperty(window, "location", {
      value: { assign, reload, href: "http://localhost/signout", pathname: "/signout" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    await forceSignOutNavigation();
    expect(assign).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("treats a csrf response with no usable token as a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ csrfToken: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));
    await forceSignOutNavigation();
    expect(submit).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/signout");
  });

  it("never navigates to the GET sign-out route, which signs nothing out", async () => {
    vi.stubGlobal("fetch", csrfOk());
    await forceSignOutNavigation();
    expect(assign).not.toHaveBeenCalledWith("/api/auth/signout");
  });
});

describe("the parked notice reaches the landing page", () => {
  it("carries it in the POST callbackUrl", async () => {
    // Preserving the notice across a failed teardown is pointless if
    // nothing collects it. The gate's only control is this function, and
    // it posted a hard-coded "/" — so a viewer whose sign-out failed and
    // who then used the recovery button landed with no explanation at
    // all, which is the outcome the parked notice exists to prevent.
    setPendingAuthNotice("password-changed");
    vi.stubGlobal("fetch", csrfOk());
    await forceSignOutNavigation();

    const form = (document.createElement as unknown as ReturnType<typeof vi.fn>).mock
      .results.map((r) => r.value as HTMLElement)
      .find((el) => el.tagName === "FORM") as HTMLFormElement;
    const fields = [...form.querySelectorAll("input")].map((i) => [i.name, i.value]);
    expect(fields).toEqual(
      expect.arrayContaining([["callbackUrl", "/?authNotice=password-changed"]]),
    );
  });

  it("carries it on the fallback navigation too", async () => {
    // The fallback is a document load, which destroys the module state
    // holding the notice — so it has to travel in the URL.
    setPendingAuthNotice("password-changed");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    await forceSignOutNavigation();
    expect(assign).toHaveBeenCalledWith("/signout?authNotice=password-changed");
  });

  it("posts a plain / when nothing is parked", async () => {
    vi.stubGlobal("fetch", csrfOk());
    await forceSignOutNavigation();
    const form = (document.createElement as unknown as ReturnType<typeof vi.fn>).mock
      .results.map((r) => r.value as HTMLElement)
      .find((el) => el.tagName === "FORM") as HTMLFormElement;
    const fields = [...form.querySelectorAll("input")].map((i) => [i.name, i.value]);
    expect(fields).toEqual(expect.arrayContaining([["callbackUrl", "/"]]));
  });
});
