/**
 * F-321 review Low: the sign-in links kept only the pathname, so a
 * `?tab=…` was lost after signing in. useSignInLink keeps path AND query,
 * still only as a same-origin relative path (safeCallbackPath).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/v/atlas" }));

import { signInHref, useSignInLink } from "@/lib/auth/sign-in-link";

function Probe() {
  const link = useSignInLink();
  return (
    <a href={link.href} onClick={link.onClick}>
      Sign in
    </a>
  );
}

const assign = vi.fn();
beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal("location", {
    ...window.location,
    pathname: "/v/atlas",
    search: "?tab=reviews&page=2",
    assign,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("signInHref", () => {
  it("keeps a relative path with its query", () => {
    expect(signInHref("/v/atlas?tab=reviews")).toBe("/login?callbackUrl=%2Fv%2Fatlas%3Ftab%3Dreviews");
  });

  it.each(["https://evil.example/x", "//evil.example", "/\\evil", "/a b"])(
    "refuses an unsafe target (%s): plain /login",
    (bad) => {
      expect(signInHref(bad)).toBe("/login");
    },
  );
});

describe("useSignInLink", () => {
  it("renders the pathname href (server-safe, middle-click)", () => {
    render(<Probe />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?callbackUrl=%2Fv%2Fatlas");
  });

  it("a click goes to sign-in with the full current address, query included", () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
    expect(assign).toHaveBeenCalledWith("/login?callbackUrl=%2Fv%2Fatlas%3Ftab%3Dreviews%26page%3D2");
  });

  it("a modified click (new tab) keeps the plain href", () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole("link", { name: "Sign in" }), { ctrlKey: true });
    expect(assign).not.toHaveBeenCalled();
  });
});
