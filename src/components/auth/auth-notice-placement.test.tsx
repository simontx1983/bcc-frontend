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
