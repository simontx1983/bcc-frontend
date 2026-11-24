/**
 * /u/[handle]/about/edit is owner-only:
 *   anonymous → login, returning here; non-owner → /about;
 *   unreadable profile → /about (which renders the real failure state);
 *   owner → the form. Never indexed.
 */

import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type ApiErrorBody } from "@/lib/api/types";

const getUser = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ current: null as null | { user: { handle: string } } }));
const redirectTo = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/api/user-endpoints", () => ({ getUser }));
vi.mock("@/lib/api/client", () => ({
  tokenFromSession: (s: unknown) => (s === null ? null : "tok"),
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (path: string) => {
    redirectTo(path);
    throw new Error("NEXT_REDIRECT");
  },
  permanentRedirect: (path: string) => {
    redirectTo(path);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/components/profile/about/AboutCard", () => ({ AboutBackLink: () => null }));
vi.mock("@/components/profile/about-edit/EditAboutForm", () => ({
  EditAboutForm: ({ handle }: { handle: string }) => <div data-testid="edit-form">{handle}</div>,
}));

const { default: EditAboutPage, metadata } = await import("./page");

afterEach(() => {
  cleanup();
  getUser.mockReset();
  redirectTo.mockReset();
  session.current = null;
});

const params = Promise.resolve({ handle: "alice" });
const PROFILE = {
  handle: "alice",
  bio: "",
  halls: [],
  verifications: {},
  counts: { blog_posts_written: 0, reviews_received: 0 },
};

describe("edit about page — owner gating", () => {
  it("anonymous → login with a callback back to the edit page", async () => {
    await expect(EditAboutPage({ params })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectTo).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent("/u/alice/about/edit")}`,
    );
    expect(getUser).not.toHaveBeenCalled();
  });

  it("a signed-in non-owner is sent to the About page", async () => {
    session.current = { user: { handle: "bob" } };
    getUser.mockResolvedValue(PROFILE);
    await expect(EditAboutPage({ params })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectTo).toHaveBeenCalledWith("/u/alice/about");
  });

  it("an unreadable profile is sent to the About page", async () => {
    session.current = { user: { handle: "bob" } };
    const body: ApiErrorBody = {
      error: { code: "bcc_permission_denied", message: "no", status: 403 },
      _meta: {} as ApiErrorBody["_meta"],
    };
    getUser.mockRejectedValue(new BccApiError("bcc_permission_denied", "no", 403, body));
    await expect(EditAboutPage({ params })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectTo).toHaveBeenCalledWith("/u/alice/about");
  });

  it("the owner gets the form", async () => {
    session.current = { user: { handle: "alice" } };
    getUser.mockResolvedValue(PROFILE);
    const { container } = render(await EditAboutPage({ params }));
    expect(within(container).getByTestId("edit-form").textContent).toBe("alice");
    expect(within(container).getByRole("heading", { level: 1 }).textContent).toBe("Edit About");
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
