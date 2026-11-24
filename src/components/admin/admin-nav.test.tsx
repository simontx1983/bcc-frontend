/**
 * AdminNav — links only to routes that exist, and marks the current one.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/admin/validators" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { AdminNav } from "@/components/admin/AdminNav";

afterEach(cleanup);

describe("AdminNav", () => {
  it("is labelled BCC Administration and links the three admin routes", () => {
    render(<AdminNav />);
    const region = screen.getByRole("navigation", { name: /bcc administration/i });
    const links = Array.from(region.querySelectorAll("a")).map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Moderation", "/admin/moderation"],
      ["Validator Directory", "/admin/validators"],
      ["Validator Audit History", "/admin/validators/history"],
    ]);
  });

  it.each([
    ["/admin/validators", "Validator Directory"],
    ["/admin/validators/history", "Validator Audit History"],
  ])("on %s, only %s is the current page", (pathname, current) => {
    nav.pathname = pathname;
    render(<AdminNav />);
    for (const link of screen.getAllByRole("link")) {
      if (link.textContent === current) expect(link).toHaveAttribute("aria-current", "page");
      else expect(link).not.toHaveAttribute("aria-current");
    }
  });
});
