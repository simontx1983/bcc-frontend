/**
 * The team routes' server shells (PR B2): signed-in only, with the way
 * back carried through login (`?revert=` included on the team screen); a
 * page id that isn't a positive whole number is a 404; `?revert=` is
 * handed to the screen only when it's an id. The shells run for real;
 * their client screens are found in the returned tree, not rendered.
 */

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ value: { bccToken: "t" } as { bccToken: string } | null }));
const REDIRECT = vi.hoisted(() => new Error("NEXT_REDIRECT"));
const NOT_FOUND = vi.hoisted(() => new Error("NEXT_NOT_FOUND"));
const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw REDIRECT;
  }),
);

vi.mock("next-auth", () => ({ getServerSession: async () => session.value }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("next/navigation", () => ({
  redirect,
  notFound: () => {
    throw NOT_FOUND;
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import MyTeamInvitesPage from "@/app/(main)/(app)/me/team-invites/page";
import { MyTeamInvites } from "@/components/validator-team/MyTeamInvites";
import { TeamPermissions } from "@/components/validator-team/TeamPermissions";
import { ValidatorTeamScreen } from "@/components/validator-team/ValidatorTeamScreen";

import ValidatorTeamPage from "./page";
import ValidatorTeamPermissionsPage from "./permissions/page";

afterEach(() => {
  redirect.mockClear();
  session.value = { bccToken: "t" };
});

/** The first element of `type` in a server component's returned tree. */
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, type);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === type) return node as ReactElement<Record<string, unknown>>;
  return find(node.props.children, type);
}

const team = (pageId: string, search: Record<string, string | string[]> = {}) =>
  ValidatorTeamPage({ params: Promise.resolve({ pageId }), searchParams: Promise.resolve(search) });

describe("/me/validator-pages/[pageId]/team", () => {
  it("hands the screen the page id, and the revert id only when it's an id", async () => {
    expect(find(await team("40"), ValidatorTeamScreen)?.props).toEqual({ pageId: 40, revertEventId: null });
    expect(find(await team("40", { revert: "91" }), ValidatorTeamScreen)?.props).toEqual({
      pageId: 40,
      revertEventId: 91,
    });
    for (const bad of ["abc", "-1", "0", "1.5", "07", ""]) {
      expect(find(await team("40", { revert: bad }), ValidatorTeamScreen)?.props["revertEventId"]).toBeNull();
    }
    expect(find(await team("40", { revert: ["91", "92"] }), ValidatorTeamScreen)?.props["revertEventId"]).toBeNull();
  });

  it.each(["abc", "0", "-3", "4.2", "040"])("page id %s is a 404", async (raw) => {
    await expect(team(raw)).rejects.toBe(NOT_FOUND);
  });

  it("anonymous viewers go through login and come back, ?revert= included", async () => {
    session.value = null;
    await expect(team("40", { revert: "91" })).rejects.toBe(REDIRECT);
    expect(redirect).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent("/me/validator-pages/40/team?revert=91")}`,
    );

    redirect.mockClear();
    await expect(team("40")).rejects.toBe(REDIRECT);
    expect(redirect).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent("/me/validator-pages/40/team")}`,
    );
  });
});

describe("/me/validator-pages/[pageId]/team/permissions", () => {
  const perms = (pageId: string) => ValidatorTeamPermissionsPage({ params: Promise.resolve({ pageId }) });

  it("hands the grid the page id; a bad id is a 404", async () => {
    expect(find(await perms("40"), TeamPermissions)?.props).toEqual({ pageId: 40 });
    await expect(perms("x")).rejects.toBe(NOT_FOUND);
  });

  it("anonymous viewers go through login and come back", async () => {
    session.value = null;
    await expect(perms("40")).rejects.toBe(REDIRECT);
    expect(redirect).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent("/me/validator-pages/40/team/permissions")}`,
    );
  });
});

describe("/me/team-invites", () => {
  it("renders my invites for a signed-in member, and sends anonymous viewers through login", async () => {
    expect(find(await MyTeamInvitesPage(), MyTeamInvites)).not.toBeNull();
    session.value = null;
    await expect(MyTeamInvitesPage()).rejects.toBe(REDIRECT);
    expect(redirect).toHaveBeenCalledWith(`/login?callbackUrl=${encodeURIComponent("/me/team-invites")}`);
  });
});
