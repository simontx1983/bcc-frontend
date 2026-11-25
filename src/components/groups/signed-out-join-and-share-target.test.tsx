/**
 * Two things the D1 render check (#430) found once the community header
 * lost its trading card:
 *   1. a signed-out visitor had no way in: the membership strip showed the
 *      server's "sign in" hint beside a dead LOCKED badge, and the card's
 *      sign-in pill was gone with the card. The strip now offers SIGN IN TO
 *      JOIN (F-321, as on a Hall), returning to this page; any other refusal
 *      keeps its verbatim hint + LOCKED;
 *   2. Share drew 39px tall; it now has a 44px tap area (HIT_AREA_44) with
 *      no visual change.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { GroupDetailResponse } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "unauthenticated", data: null }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/communities/night-shift",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: unknown; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/useHallsPrimary", () => ({
  useJoinHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));

const { GroupMembershipStrip } = await import("@/components/groups/GroupMembershipStrip");
const { ShareButton } = await import("@/components/common/ShareButton");

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

function renderStrip(canJoin: { allowed: boolean; unlock_hint: string | null; reason_code: string | null }) {
  const group = {
    id: 52,
    slug: "night-shift",
    name: "Night Shift",
    type: "user",
    privacy: "open",
    viewer_membership: null,
    permissions: {
      can_leave: { allowed: false, unlock_hint: null, reason_code: "not_member" },
      can_join: canJoin,
      can_read_feed: { allowed: true, unlock_hint: null, reason_code: null },
      can_request_join: { allowed: false, unlock_hint: null, reason_code: "not_applicable" },
    },
  } as unknown as GroupDetailResponse;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GroupMembershipStrip group={group} />
    </QueryClientProvider>,
  );
}

describe("1. a signed-out visitor gets a way in", () => {
  for (const reason of ["auth_required", "signin_required"]) {
    it(`${reason}: the hint verbatim and SIGN IN TO JOIN, back to this page; no LOCKED`, () => {
      renderStrip({ allowed: false, unlock_hint: "Sign in to join.", reason_code: reason });
      expect(screen.getByText("Sign in to join.")).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "SIGN IN TO JOIN" });
      expect(link).toHaveAttribute("href", "/login?callbackUrl=%2Fcommunities%2Fnight-shift");
      expect(link.className).toContain("min-h-[44px]");
      expect(screen.queryByText("LOCKED")).toBeNull();
    });
  }

  it("a refusal that isn't about signing in keeps its hint and LOCKED, with no sign-in link", () => {
    renderStrip({ allowed: false, unlock_hint: "Reputation 50 or higher is needed to join.", reason_code: "trust_threshold" });
    expect(screen.getByText("Reputation 50 or higher is needed to join.")).toBeInTheDocument();
    expect(screen.getByText("LOCKED")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "SIGN IN TO JOIN" })).toBeNull();
  });
});

describe("2. Share is a 44px target", () => {
  it("the button carries the invisible 44px hit area", () => {
    render(<ShareButton path="/communities/night-shift" title="Night Shift" ariaLabel="Share Night Shift" />);
    const button = screen.getByRole("button", { name: "Share Night Shift" });
    expect(button.className).toContain("before:h-11");
    expect(button.className).toContain("relative");
  });
});
