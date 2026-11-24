/**
 * F-317 M-gr1 — what a refused join says, on the group page strip, the
 * Hall page controls and the community trading card.
 *
 * Before: a suspended member was told a Hall "doesn't accept open
 * membership"; a plain-group join had no suspension or conflict copy at
 * all; and CONNECT ANOTHER WALLET appeared under every holder refusal but a
 * rate limit (a suspension, a provider outage), where another wallet
 * changes nothing.
 *
 * The codes (contract §4.7 / §4.7.1 / §4.7.3):
 *   - holder, delegator and plain joins answer `bcc_forbidden` ONLY for a
 *     suspended account;
 *   - a Hall join answers it for a suspension, a Hall closed to open
 *     joining, or a moderator's ban, with nothing in `error.data` to tell
 *     them apart, so the Hall line is true of all three.
 * Copy is keyed on the code, never on `error.message` (§γ); every refusal
 * here carries server wording that must not appear.
 *
 * Only the API client and the wallet layer are faked, as in
 * validator-group-join.test.tsx. Fixtures only.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type Card, type GroupDetailResponse } from "@/lib/api/types";

const bccFetchAsClient = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({ bccFetchAsClient, bccFetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  // HallMembershipControls' signed-out link reads where to return to.
  usePathname: () => "/halls/osmosis",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: null }) }));
vi.mock("@/hooks/useWallets", () => ({
  useMyWallets: () => ({ isSuccess: true, data: { items: [{ verified: true, chain_slug: "stargaze" }] } }),
  useLinkWalletMutation: () => ({
    isPending: false,
    error: null,
    reset: vi.fn(),
    mutateAsync: vi.fn(async () => undefined),
  }),
}));
vi.mock("@/components/groups/GroupTransferOwnership", () => ({ GroupTransferOwnership: () => null }));
vi.mock("@/lib/wallet/linkFlow", () => ({ humanizeLinkError: () => "link failed" }));
vi.mock("@/lib/wallet/chain-catalog", () => ({
  findWalletChain: (slug: string) =>
    slug === "stargaze" ? { slug, label: "Stargaze", chainType: "cosmos" } : undefined,
}));
vi.mock("@/components/cards/CardFactory", () => ({
  CardFactory: ({ card, onJoin }: { card: Card; onJoin: (c: Card) => void }) => (
    <button type="button" onClick={() => onJoin(card)}>
      CARD JOIN
    </button>
  ),
}));

import { CommunityJoinCard } from "@/components/communities/CommunityJoinCard";
import { GroupMembershipStrip, humanizeMembershipError } from "@/components/groups/GroupMembershipStrip";
import { HallMembershipControls } from "@/components/halls/HallMembershipControls";

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

beforeEach(() => {
  bccFetchAsClient.mockReset();
  refresh.mockReset();
});

afterEach(cleanup);

const RAW = "server wording that must never be shown";
const refused = (code: string, status: number) => new BccApiError(code, RAW, status, null);

const SUSPENDED = "Your account is suspended, so you can't join communities right now.";
const HALL_REFUSED = "You can't join this Hall right now.";
const CONFLICT = "This changed a moment ago. Showing the latest.";
const OLD_HALL_LINE = /doesn't accept open membership/;

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const ALLOW = { allowed: true, unlock_hint: null, reason_code: null };
const NOT_MEMBER = { allowed: false, unlock_hint: null, reason_code: "not_member" };

function openGroup(type: "user" | "hall"): GroupDetailResponse {
  return {
    id: 41,
    name: "Night Shift",
    type,
    viewer_membership: { is_member: false, joined_at: null, status: "none" },
    permissions: { can_leave: NOT_MEMBER, can_join: ALLOW, can_read_feed: ALLOW },
  } as unknown as GroupDetailResponse;
}

function holderGroup(): GroupDetailResponse {
  return {
    id: 42,
    name: "Bad Kids",
    type: "nft",
    chain_tag: "stargaze",
    viewer_membership: { is_member: false, joined_at: null, status: "none" },
    permissions: {
      can_leave: NOT_MEMBER,
      can_join: { allowed: false, unlock_hint: "Hold a Bad Kids NFT to join.", reason_code: "not_eligible" },
      can_read_feed: ALLOW,
    },
  } as unknown as GroupDetailResponse;
}

const alert = () => screen.findByRole("alert");

describe("humanizeMembershipError", () => {
  it("a group's 403 bcc_forbidden on join is a suspension; a Hall's is not named as one", () => {
    expect(humanizeMembershipError(refused("bcc_forbidden", 403), "join", "group")).toBe(SUSPENDED);
    expect(humanizeMembershipError(refused("bcc_forbidden", 403), "join", "Hall")).toBe(HALL_REFUSED);
  });

  it("no leave answers bcc_forbidden, so a leave never claims a suspension", () => {
    expect(humanizeMembershipError(refused("bcc_forbidden", 403), "leave", "group")).toBe(
      "Couldn't leave this group. Try again.",
    );
  });

  it("a leave refused with bcc_permission_denied is the owner, not 'requirements'", () => {
    expect(humanizeMembershipError(refused("bcc_permission_denied", 403), "leave", "group")).toBe(
      "Owners can't leave their own community. Hand off ownership first.",
    );
  });

  it("a 409 says the page is showing the latest; a 503 says nothing changed", () => {
    expect(humanizeMembershipError(refused("bcc_conflict", 409), "join", "Hall")).toBe(CONFLICT);
    expect(humanizeMembershipError(refused("bcc_unavailable", 503), "join", "group")).toBe(
      "Something went wrong on our side. Nothing changed — try again.",
    );
  });

  it("the holder's 'couldn't verify' is retryable, never an eligibility answer", () => {
    const line = humanizeMembershipError(refused("bcc_upstream_unavailable", 503), "join", "group");
    expect(line).toMatch(/Nothing changed — try again/);
    expect(line).not.toMatch(/requirements|hold/i);
  });

  it("names the Hall in its own copy", () => {
    expect(humanizeMembershipError(refused("bcc_internal_error", 500), "leave", "Hall")).toBe(
      "Couldn't leave this Hall. Try again.",
    );
  });
});

describe("GroupMembershipStrip — a refused join", () => {
  it("a suspended member joining a plain group is told so", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_forbidden", 403));
    withClient(<GroupMembershipStrip group={openGroup("user")} />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN" }));

    expect(await alert()).toHaveTextContent(SUSPENDED);
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it("a refused Hall join gets the Hall line, not the suspension or the old open-membership line", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_forbidden", 403));
    withClient(<GroupMembershipStrip group={openGroup("hall")} />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN" }));

    expect(await alert()).toHaveTextContent(HALL_REFUSED);
    expect(screen.queryByText(SUSPENDED)).toBeNull();
    expect(screen.queryByText(OLD_HALL_LINE)).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it("a 409 says it is showing the latest, and re-reads the page", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_conflict", 409));
    withClient(<GroupMembershipStrip group={openGroup("user")} />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN" }));

    expect(await alert()).toHaveTextContent(CONFLICT);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("control: any other refusal does not re-read the page", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_forbidden", 403));
    withClient(<GroupMembershipStrip group={openGroup("user")} />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN" }));

    await alert();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("GroupMembershipStrip — CONNECT ANOTHER WALLET on a holder group", () => {
  const connectAnother = () => screen.queryByRole("button", { name: "CONNECT ANOTHER WALLET" });

  it("is offered when the answer is 'doesn't hold it' (bcc_permission_denied)", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_permission_denied", 403));
    withClient(<GroupMembershipStrip group={holderGroup()} />);

    fireEvent.click(screen.getByRole("button", { name: "CHECK & JOIN" }));

    await alert();
    expect(connectAnother()).toBeInTheDocument();
  });

  it("is not offered to a suspended account; the suspension is named", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_forbidden", 403));
    withClient(<GroupMembershipStrip group={holderGroup()} />);

    fireEvent.click(screen.getByRole("button", { name: "CHECK & JOIN" }));

    expect(await alert()).toHaveTextContent(SUSPENDED);
    expect(connectAnother()).toBeNull();
  });

  it("is not offered when ownership couldn't be checked (an outage)", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_upstream_unavailable", 503));
    withClient(<GroupMembershipStrip group={holderGroup()} />);

    fireEvent.click(screen.getByRole("button", { name: "CHECK & JOIN" }));

    expect(await alert()).toHaveTextContent(/Nothing changed — try again/);
    expect(connectAnother()).toBeNull();
  });

  it("is not offered on an unsupported chain", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_internal_error", 503));
    withClient(<GroupMembershipStrip group={holderGroup()} />);

    fireEvent.click(screen.getByRole("button", { name: "CHECK & JOIN" }));

    await alert();
    expect(connectAnother()).toBeNull();
  });
});

describe("HallMembershipControls — per-action copy", () => {
  const nonMember = { is_member: false, is_primary: false } as unknown as Parameters<
    typeof HallMembershipControls
  >[0]["membership"];
  const member = { is_member: true, is_primary: false } as unknown as Parameters<
    typeof HallMembershipControls
  >[0]["membership"];

  it("a refused JOIN HALL gets the Hall line, never 'doesn't accept open membership'", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_forbidden", 403));
    withClient(<HallMembershipControls groupId={7} membership={nonMember} />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN HALL" }));

    expect(await alert()).toHaveTextContent(HALL_REFUSED);
    expect(screen.queryByText(OLD_HALL_LINE)).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("SET AS PRIMARY refused as not-a-member says so and re-reads the page", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_forbidden", 403));
    withClient(<HallMembershipControls groupId={7} membership={member} />);

    fireEvent.click(screen.getByRole("button", { name: "SET AS PRIMARY" }));

    expect(await alert()).toHaveTextContent("Only members can make a Hall their primary. Showing the latest.");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("a 409 on JOIN HALL says it is showing the latest, and re-reads the page", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_conflict", 409));
    withClient(<HallMembershipControls groupId={7} membership={nonMember} />);

    fireEvent.click(screen.getByRole("button", { name: "JOIN HALL" }));

    expect(await alert()).toHaveTextContent(CONFLICT);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});

describe("CommunityJoinCard — a refused Hall join is not called a suspension", () => {
  const card = (type: "hall" | "user") =>
    ({
      id: 43,
      community_dossier: { type, privacy: "open", trust_min: null, viewer_is_member: false },
    }) as unknown as Card;

  it("Hall: the Hall line", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_forbidden", 403));
    withClient(<CommunityJoinCard card={card("hall")} />);

    fireEvent.click(screen.getByRole("button", { name: "CARD JOIN" }));

    expect(await alert()).toHaveTextContent(HALL_REFUSED);
    expect(screen.queryByText(SUSPENDED)).toBeNull();
  });

  it("plain group: the suspension", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_forbidden", 403));
    withClient(<CommunityJoinCard card={card("user")} />);

    fireEvent.click(screen.getByRole("button", { name: "CARD JOIN" }));

    expect(await alert()).toHaveTextContent(SUSPENDED);
  });

  it("a 409 re-reads the page", async () => {
    bccFetchAsClient.mockRejectedValue(refused("bcc_conflict", 409));
    withClient(<CommunityJoinCard card={card("hall")} />);

    fireEvent.click(screen.getByRole("button", { name: "CARD JOIN" }));

    expect(await alert()).toHaveTextContent(CONFLICT);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
