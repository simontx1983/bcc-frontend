/**
 * The sign-out explanation has to be mounted where a SIGNED-OUT viewer
 * actually lands.
 *
 * `endSession` carries its reason across the teardown navigation as
 * `/?authNotice=<slug>`. After a sign-out the viewer is anonymous, so `/`
 * resolves to the (marketing) group, whose layout deliberately does not
 * render AppShell. While the notice was mounted inside AppShell the slug
 * was therefore dropped for the only audience that ever receives one —
 * browser-measured: `/?authNotice=standing` while signed out rendered no
 * notice and did not scrub the param.
 *
 * These tests pin the placement, not just the copy. A copy test passes
 * happily while the component is mounted somewhere unreachable.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MainLayout from "@/app/(main)/layout";

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/",
  useSearchParams: () => search,
}));

// jsdom has no IntersectionObserver, and MinimalShell (the (auth) shell)
// uses one. Stubbed rather than mocking the shell away, so the test keeps
// rendering the REAL layout.
class NoopIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
}
vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);

beforeEach(() => {
  replace.mockClear();
  search = new URLSearchParams();
});

// This project does not enable RTL auto-cleanup; without this, every
// render accumulates and a role query matches the previous test's toast.
afterEach(cleanup);

describe("authNotice placement", () => {
  it("the shared (main) root renders the notice, so (marketing) gets it too", async () => {
    search = new URLSearchParams("authNotice=standing");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);

    // The anonymous landing page is a sibling of (app); this is the only
    // layout all of them share.
    await waitFor(() => {
      expect(
        screen.getByText(/your account is under review/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("landing")).toBeInTheDocument();
  });

  it("renders the sign-out slug", async () => {
    search = new URLSearchParams("authNotice=signed-out");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(screen.getByText(/your session ended/i)).toBeInTheDocument();
    });
  });

  it("renders the push-cleanup slug, which is the one that carries a caveat", async () => {
    search = new URLSearchParams("authNotice=push-cleanup");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(
        screen.getByText(/switch off push notifications/i),
      ).toBeInTheDocument();
    });
    // Says what to do about it, and does not claim it was turned off.
    const copy = screen.getByRole("status").textContent ?? "";
    expect(copy).toMatch(/browser settings/i);
  });

  it("scrubs the param so a refresh does not re-show it", async () => {
    search = new URLSearchParams("authNotice=standing");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/");
    });
  });

  it("renders nothing, and navigates nowhere, without a slug", () => {
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    expect(screen.queryByRole("status")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores an unknown slug rather than rendering an empty toast", () => {
    search = new URLSearchParams("authNotice=not-a-real-slug");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("AppShell no longer mounts a second copy", async () => {
    // Two mounts would double every toast. The notice moved OUT of
    // AppShell; this asserts it did not get left behind.
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/layout/AppShell.tsx", "utf8"),
    );
    expect(src).not.toMatch(/AuthRedirectNotice/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// A slug is attacker-supplied text, not a key into an object literal
// ─────────────────────────────────────────────────────────────────────

describe("prototype keys are not copy", () => {
  it("renders nothing for ?authNotice=__proto__ instead of crashing", () => {
    // COPY["__proto__"] resolves to Object.prototype, and React throws
    // "Objects are not valid as a React child" on it. There is no segment
    // error boundary, so the whole page was replaced by the global error
    // UI. Moving this component into the shared (main) layout put it on
    // the ANONYMOUS site root too, making /?authNotice=__proto__ a
    // one-click reflected crash of the public landing page.
    search = new URLSearchParams("authNotice=__proto__");
    expect(() =>
      render(<MainLayout>{<p>landing</p>}</MainLayout>),
    ).not.toThrow();
    expect(screen.getByText("landing")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing for ?authNotice=constructor", () => {
    search = new URLSearchParams("authNotice=constructor");
    expect(() =>
      render(<MainLayout>{<p>landing</p>}</MainLayout>),
    ).not.toThrow();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing for ?authNotice=toString", () => {
    search = new URLSearchParams("authNotice=toString");
    expect(() =>
      render(<MainLayout>{<p>landing</p>}</MainLayout>),
    ).not.toThrow();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// (auth) is a LANDING TARGET too, not just somewhere people navigate
// ─────────────────────────────────────────────────────────────────────

describe("the (auth) group", () => {
  it("renders the notice, because endSession can land on /login", async () => {
    // `endSession({ callbackUrl: "/login" })` — the password-change
    // recovery path — lands in (auth), which is a SIBLING of (main), so
    // the (main) mount cannot cover it. Without this the explanation
    // renders nowhere and the param is not even scrubbed.
    search = new URLSearchParams("authNotice=password-changed");
    const { default: AuthLayout } = await import("@/app/(auth)/layout");
    render(<AuthLayout>{<p>sign-in form</p>}</AuthLayout>);

    await waitFor(() => {
      expect(screen.getByText(/your password was changed/i)).toBeInTheDocument();
    });
    expect(screen.getByText("sign-in form")).toBeInTheDocument();
  });
});

describe("the password-changed slug", () => {
  it("says the change LANDED and to use the new password", async () => {
    search = new URLSearchParams("authNotice=password-changed");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    const copy = screen.getByRole("status").textContent ?? "";
    // Both facts, because either alone misleads: without the first they
    // may retry the old password; without the second they may try to
    // change it again with a current_password that no longer works.
    expect(copy).toMatch(/password was changed/i);
    expect(copy).toMatch(/new password/i);
    expect(copy).not.toMatch(/session ended/i);
  });
});

describe("the push caveat rider", () => {
  it("accompanies another reason instead of replacing it", async () => {
    search = new URLSearchParams("authNotice=password-changed&authNoticePush=1");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    const copy = screen.getByRole("status").textContent ?? "";
    expect(copy).toMatch(/password was changed/i);
    expect(copy).toMatch(/switch off push notifications/i);
  });

  it("renders alone when it is the only thing to say", async () => {
    search = new URLSearchParams("authNoticePush=1");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(
        screen.getByText(/switch off push notifications/i),
      ).toBeInTheDocument();
    });
  });

  it("is scrubbed from the URL even without a primary slug", async () => {
    search = new URLSearchParams("authNoticePush=1");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/");
    });
  });

  it("stays silent when the flag is absent", async () => {
    search = new URLSearchParams("authNotice=standing");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(screen.getByRole("status").textContent).not.toMatch(/push/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The scrub must not eat the page's own params
// ─────────────────────────────────────────────────────────────────────

describe("scrubbing", () => {
  it("removes only our params and keeps the rest", async () => {
    // Replacing with `pathname` alone dropped the whole query string,
    // which became load-bearing once this component was mounted on the
    // (auth) group: /login?callbackUrl=…, /reset-password?token=…,
    // /signup/complete-profile?pt=…&email=… all carry params.
    search = new URLSearchParams(
      "callbackUrl=%2Fsettings&authNotice=standing&authNoticePush=1",
    );
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(replace).toHaveBeenCalled();
    });
    const target = String(replace.mock.calls[0]?.[0] ?? "");
    expect(target).toContain("callbackUrl=%2Fsettings");
    expect(target).not.toContain("authNotice");
    expect(target).not.toContain("authNoticePush");
  });

  it("drops the query entirely when our params were the only ones", async () => {
    search = new URLSearchParams("authNotice=standing");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/");
    });
  });
});

describe("the scrub preserves the fragment", () => {
  it("keeps #section, which the URL composition went out of its way to emit", async () => {
    // session-boundary now deliberately emits "/dash?authNotice=x#section"
    // so the params stay readable. Replacing with pathname + query alone
    // discarded the hash — the composition half of that fix undone by the
    // scrub half.
    window.location.hash = "#section";
    search = new URLSearchParams("authNotice=standing");
    render(<MainLayout>{<p>landing</p>}</MainLayout>);
    await waitFor(() => {
      expect(replace).toHaveBeenCalled();
    });
    expect(String(replace.mock.calls[0]?.[0] ?? "")).toContain("#section");
    window.location.hash = "";
  });
});
