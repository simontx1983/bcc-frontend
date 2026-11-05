/**
 * Joining a delegator community goes through the verified route and nothing
 * else. These groups are stored `closed`, so the plain join 400s on them and
 * a plain "Private" reading of the card would dead-end the viewer before any
 * check ever ran.
 *
 * Only the API client and the wallet layer are faked, so the assertions are
 * on the real paths the endpoint wrappers build. Fixtures only.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BccApiError,
  type Card,
  type CardCommunityDossier,
  type GroupDetailResponse,
} from "@/lib/api/types";

const bccFetchAsClient = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const wallets = vi.hoisted(() => ({
  current: {
    isSuccess: true,
    data: { items: [{ verified: true, chain_slug: "cosmoshub" }] },
  } as { isSuccess: boolean; data?: { items: Array<{ verified: boolean; chain_slug: string }> } },
}));

vi.mock("@/lib/api/client", () => ({ bccFetchAsClient, bccFetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/hooks/useWallets", () => ({
  useMyWallets: () => wallets.current,
  useLinkWalletMutation: () => ({
    isPending: false,
    error: null,
    reset: vi.fn(),
    mutateAsync: vi.fn(async () => undefined),
  }),
}));
// Unrelated to the join dispatch; its mutation modules reach env at import.
vi.mock("@/components/groups/GroupTransferOwnership", () => ({
  GroupTransferOwnership: () => null,
}));
vi.mock("@/lib/wallet/linkFlow", () => ({ humanizeLinkError: () => "link failed" }));
vi.mock("@/lib/wallet/chain-catalog", () => ({
  findWalletChain: (slug: string) =>
    slug === "cosmoshub"
      ? { slug, label: "Cosmos Hub", chainType: "cosmos" }
      : undefined,
}));
// The card is a stand-in with one job: hand the JOIN press to the wiring
// under test. The real action bar has its own tests below.
vi.mock("@/components/cards/CardFactory", () => ({
  CardFactory: ({ card, onJoin }: { card: Card; onJoin: (c: Card) => void }) => (
    <button type="button" onClick={() => onJoin(card)}>
      CARD JOIN
    </button>
  ),
}));

import { CommunityJoinCard } from "@/components/communities/CommunityJoinCard";
import { GroupMembershipStrip } from "@/components/groups/GroupMembershipStrip";

const GROUP_ID = 31;
const JOIN_PATH = `me/validator-groups/${GROUP_ID}/join`;
const NOT_ENOUGH = /You don't delegate enough to this validator/;
const COULD_NOT_VERIFY = /Couldn't verify your delegation right now/;
const COOLDOWN = /You can't rejoin this group yet/;

function denied(code: string, status: number, data?: Record<string, unknown>) {
  return new BccApiError(
    code,
    "server wording that must never be shown",
    status,
    data !== undefined
      ? { error: { code, message: "x", status, data }, _meta: { version: "v1" } }
      : null,
  );
}

function group(overrides: Partial<GroupDetailResponse> = {}): GroupDetailResponse {
  return {
    id: GROUP_ID,
    type: "validator",
    chain_tag: "cosmoshub",
    viewer_membership: { is_member: false },
    permissions: {
      can_leave: { allowed: false, unlock_hint: null, reason_code: "not_member" },
      can_join: {
        allowed: false,
        unlock_hint: "Delegate at least 5 ATOM to this validator to join.",
        reason_code: "not_eligible",
      },
    },
    ...overrides,
  } as unknown as GroupDetailResponse;
}

function communityCard(type: CardCommunityDossier["type"]): Card {
  return {
    id: GROUP_ID,
    community_dossier: { type, privacy: "closed", trust_min: null, viewer_is_member: false },
  } as unknown as Card;
}

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  bccFetchAsClient.mockReset();
  refresh.mockReset();
  wallets.current = {
    isSuccess: true,
    data: { items: [{ verified: true, chain_slug: "cosmoshub" }] },
  };
});

afterEach(cleanup);

describe("GroupMembershipStrip, validator group", () => {
  it("offers CHECK & JOIN with the server's hint, and joins through the verified route", async () => {
    bccFetchAsClient.mockResolvedValue({ joined: true, group_id: GROUP_ID, code: "ok" });
    withClient(<GroupMembershipStrip group={group()} />);

    expect(
      screen.getByText("Delegate at least 5 ATOM to this validator to join."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CHECK & JOIN" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(bccFetchAsClient).toHaveBeenCalledTimes(1);
    expect(bccFetchAsClient).toHaveBeenCalledWith(JOIN_PATH, { method: "POST" });
  });

  it("says which validator and chain the group serves, above the join", () => {
    withClient(
      <GroupMembershipStrip
        group={group({
          validator_stats: {
            moniker: "Acme Staking",
            chain_name: "Osmosis",
            min_stake_display: "5 OSMO",
            validator_page: "/v/acme-staking",
          },
        })}
      />,
    );

    const line = screen.getByTestId("group-validator-served");
    expect(line).toHaveTextContent("For Acme Staking on Osmosis");
    expect(screen.getByRole("link", { name: "Acme Staking" })).toHaveAttribute(
      "href",
      "/v/acme-staking",
    );
    const button = screen.getByRole("button", { name: "CHECK & JOIN" });
    expect(line.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("still names the validator before chain_name reaches the wire", () => {
    withClient(
      <GroupMembershipStrip
        group={group({
          validator_stats: {
            moniker: "Acme Staking",
            min_stake_display: null,
            validator_page: null,
          },
        })}
      />,
    );

    expect(screen.getByTestId("group-validator-served")).toHaveTextContent(/^For Acme Staking$/);
  });

  it("shows no line when the validator isn't indexed yet", () => {
    withClient(<GroupMembershipStrip group={group({ validator_stats: null })} />);

    expect(screen.queryByTestId("group-validator-served")).toBeNull();
    expect(screen.getByRole("button", { name: "CHECK & JOIN" })).toBeInTheDocument();
  });

  it("does not flip the pill to MEMBER while the check is unresolved", async () => {
    bccFetchAsClient.mockReturnValue(new Promise(() => {}));
    withClient(<GroupMembershipStrip group={group()} />);

    fireEvent.click(screen.getByRole("button", { name: "CHECK & JOIN" }));

    await screen.findByRole("button", { name: "VERIFYING…" });
    expect(screen.queryByText("MEMBER")).toBeNull();
    expect(screen.getByText("NOT A MEMBER")).toBeInTheDocument();
  });

  it("says the viewer doesn't delegate enough on a 403, and offers another wallet", async () => {
    bccFetchAsClient.mockRejectedValue(denied("bcc_permission_denied", 403));
    withClient(<GroupMembershipStrip group={group()} />);

    fireEvent.click(screen.getByRole("button", { name: "CHECK & JOIN" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_ENOUGH);
    expect(screen.queryByText(COULD_NOT_VERIFY)).toBeNull();
    expect(screen.queryByText(COOLDOWN)).toBeNull();
    expect(screen.queryByText(/server wording/)).toBeNull();
    expect(screen.getByRole("button", { name: "CONNECT ANOTHER WALLET" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("names the cooldown on opt_out_active, not the delegation, and offers no wallet", async () => {
    bccFetchAsClient.mockRejectedValue(
      denied("bcc_permission_denied", 403, { reason_code: "opt_out_active" }),
    );
    withClient(<GroupMembershipStrip group={group()} />);

    fireEvent.click(screen.getByRole("button", { name: "CHECK & JOIN" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COOLDOWN);
    expect(screen.queryByText(NOT_ENOUGH)).toBeNull();
    expect(screen.queryByRole("button", { name: "CONNECT ANOTHER WALLET" })).toBeNull();
  });

  it("says it couldn't verify on a 503, and leaves the retry as the next step", async () => {
    bccFetchAsClient.mockRejectedValue(denied("bcc_upstream_unavailable", 503));
    withClient(<GroupMembershipStrip group={group()} />);

    fireEvent.click(screen.getByRole("button", { name: "CHECK & JOIN" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COULD_NOT_VERIFY);
    expect(screen.queryByText(NOT_ENOUGH)).toBeNull();
    expect(screen.queryByRole("button", { name: "CONNECT ANOTHER WALLET" })).toBeNull();
    expect(screen.getByRole("button", { name: "CHECK & JOIN" })).toBeEnabled();
  });

  it("offers to connect a wallet first when none is linked on the group's chain", () => {
    wallets.current = { isSuccess: true, data: { items: [] } };
    withClient(<GroupMembershipStrip group={group()} />);

    expect(screen.getByRole("button", { name: "CONNECT WALLET & VERIFY" })).toBeInTheDocument();
    expect(
      screen.getByText("Connect a Cosmos Hub wallet to verify you delegate to this validator."),
    ).toBeInTheDocument();
  });

  it("leaves through the validator route", async () => {
    bccFetchAsClient.mockResolvedValue({ left: true, group_id: GROUP_ID });
    withClient(
      <GroupMembershipStrip
        group={group({
          viewer_membership: { is_member: true },
          permissions: {
            can_leave: { allowed: true, unlock_hint: null, reason_code: null },
            can_join: { allowed: false, unlock_hint: null, reason_code: "already_member" },
          },
        } as unknown as Partial<GroupDetailResponse>)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(bccFetchAsClient).toHaveBeenCalledWith(`me/validator-groups/${GROUP_ID}/leave`, {
      method: "POST",
    });
  });

  it("keeps the sign-in hint for an anonymous viewer, with no check to run", () => {
    withClient(
      <GroupMembershipStrip
        group={group({
          viewer_membership: null,
          permissions: {
            can_leave: { allowed: false, unlock_hint: null, reason_code: "auth_required" },
            can_join: {
              allowed: false,
              unlock_hint: "Sign in to join.",
              reason_code: "auth_required",
            },
          },
        } as unknown as Partial<GroupDetailResponse>)}
      />,
    );

    expect(screen.getByText("Sign in to join.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CHECK & JOIN" })).toBeNull();
  });
});

describe("CommunityJoinCard, validator group", () => {
  it("joins through the verified route, never the plain one", async () => {
    bccFetchAsClient.mockResolvedValue({ joined: true, group_id: GROUP_ID, code: "ok" });
    withClient(<CommunityJoinCard card={communityCard("validator")} />);

    fireEvent.click(screen.getByRole("button", { name: "CARD JOIN" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(bccFetchAsClient).toHaveBeenCalledTimes(1);
    expect(bccFetchAsClient).toHaveBeenCalledWith(JOIN_PATH, { method: "POST" });
  });

  it("names the cooldown on opt_out_active", async () => {
    bccFetchAsClient.mockRejectedValue(
      denied("bcc_permission_denied", 403, { reason_code: "opt_out_active" }),
    );
    withClient(<CommunityJoinCard card={communityCard("validator")} />);

    fireEvent.click(screen.getByRole("button", { name: "CARD JOIN" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COOLDOWN);
    expect(screen.queryByText(NOT_ENOUGH)).toBeNull();
  });

  it("shows both failures in their own words", async () => {
    bccFetchAsClient.mockRejectedValueOnce(denied("bcc_permission_denied", 403));
    withClient(<CommunityJoinCard card={communityCard("validator")} />);

    fireEvent.click(screen.getByRole("button", { name: "CARD JOIN" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_ENOUGH);

    bccFetchAsClient.mockRejectedValueOnce(denied("bcc_upstream_unavailable", 503));
    fireEvent.click(screen.getByRole("button", { name: "CARD JOIN" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(COULD_NOT_VERIFY),
    );
    expect(screen.queryByText(NOT_ENOUGH)).toBeNull();
  });
});
