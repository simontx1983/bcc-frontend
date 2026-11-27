/**
 * "Open in wallet app" on the other wallet surfaces: Settings → Wallets'
 * link form, a group's "connect a wallet to join" (the main phone case:
 * NFT holder and validator groups), and the recovery-email wallet step.
 * Each shows the step after a "not installed" error on a touch-only
 * device, for its own chain type, and not otherwise.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as LinkFlowModule from "@/lib/wallet/linkFlow";
import type { GroupDetailResponse, LinkedWallet } from "@/lib/api/types";

const pointer = vi.hoisted(() => ({ touchOnly: true }));
const h = vi.hoisted(() => ({
  runLinkFlow: vi.fn(),
  linkError: null as unknown,
  recoveryError: null as unknown,
  walletItems: [] as unknown[],
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/communities/mad-lads",
}));
vi.mock("@/lib/api/client", () => ({ bccFetchAsClient: vi.fn(), bccFetch: vi.fn() }));
vi.mock("@/lib/wallet/linkFlow", async (importActual) => ({
  ...(await importActual<typeof LinkFlowModule>()),
  runLinkFlow: (...a: unknown[]) => h.runLinkFlow(...a),
}));
vi.mock("@/hooks/useWallets", () => ({
  MY_WALLETS_QUERY_KEY: ["bcc", "me", "wallets"],
  useMyWallets: () => ({
    isSuccess: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    data: { items: h.walletItems, recovery: { has_recovery_email: true, verified_wallet_count: 1 } },
  }),
  useUnlinkWallet: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  useLinkWalletMutation: () => ({ isPending: false, error: h.linkError, reset: vi.fn(), mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useRecoveryEmail", () => ({
  useRequestRecoveryEmail: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn(), error: h.recoveryError }),
  useVerifyRecoveryEmail: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn(), error: null }),
}));
vi.mock("@/components/onchain/CollectionStancePanel", () => ({ CollectionStancePanel: () => null }));
vi.mock("@/components/groups/GroupTransferOwnership", () => ({ GroupTransferOwnership: () => null }));

const { OPEN_IN_WALLET_HEADING } = await import("@/components/wallet/OpenInWalletApp");
const { WalletsSection } = await import("@/components/settings/WalletsSection");
const { GroupMembershipStrip } = await import("@/components/groups/GroupMembershipStrip");
const { RecoveryEmailForm } = await import("@/components/settings/RecoveryEmail");
const { KeplrUnavailableError, KeplrUserRejectedError } = await import("@/lib/wallet/keplr");
const { PhantomUnavailableError } = await import("@/lib/wallet/phantom");

function installPointer() {
  window.matchMedia = ((q: string) => ({
    matches:
      q === "(any-pointer: coarse)" ? pointer.touchOnly : q === "(any-pointer: fine)" ? !pointer.touchOnly : false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.clearAllMocks();
  pointer.touchOnly = true;
  installPointer();
  h.linkError = null;
  h.recoveryError = null;
  h.walletItems = [];
});
afterEach(cleanup);

const withClient = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const step = () => screen.queryByRole("group", { name: OPEN_IN_WALLET_HEADING });
const linkNames = () => within(step() as HTMLElement).getAllByRole("link").map((a) => a.textContent);

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe("Settings → Wallets, link a wallet", () => {
  it("Solana with no Phantom on a phone: Phantom and Solflare", async () => {
    h.runLinkFlow.mockRejectedValue(new PhantomUnavailableError());
    withClient(<WalletsSection />);
    fireEvent.change(screen.getByLabelText("Chain"), { target: { value: "solana" } });
    fireEvent.click(screen.getByRole("button", { name: "Link wallet" }));
    await flush();
    expect(linkNames()).toEqual(["Open in Phantom", "Open in Solflare"]);
  });

  it("a declined prompt is not 'not installed': no step", async () => {
    h.runLinkFlow.mockRejectedValue(new KeplrUserRejectedError("connect"));
    withClient(<WalletsSection />);
    fireEvent.change(screen.getByLabelText("Chain"), { target: { value: "cosmos" } });
    fireEvent.click(screen.getByRole("button", { name: "Link wallet" }));
    await flush();
    expect(step()).toBeNull();
  });
});

function validatorGroup(): GroupDetailResponse {
  return {
    id: 31,
    type: "validator",
    chain_tag: "cosmos",
    viewer_membership: { is_member: false },
    permissions: {
      can_leave: { allowed: false, unlock_hint: null, reason_code: "not_member" },
      can_join: { allowed: false, unlock_hint: "Delegate to join.", reason_code: "not_eligible" },
    },
  } as unknown as GroupDetailResponse;
}

describe("a group's 'connect a wallet to join'", () => {
  it("no Keplr on a phone: 'Open in Keplr' under CONNECT WALLET & VERIFY", () => {
    h.linkError = new KeplrUnavailableError();
    withClient(<GroupMembershipStrip group={validatorGroup()} />);
    expect(screen.getByRole("button", { name: "CONNECT WALLET & VERIFY" })).toBeInTheDocument();
    expect(linkNames()).toEqual(["Open in Keplr"]);
  });

  it("not on a desktop, and not without a 'not installed' error", () => {
    h.linkError = new KeplrUnavailableError();
    pointer.touchOnly = false;
    installPointer();
    withClient(<GroupMembershipStrip group={validatorGroup()} />);
    expect(step()).toBeNull();
    cleanup();

    pointer.touchOnly = true;
    installPointer();
    h.linkError = null;
    withClient(<GroupMembershipStrip group={validatorGroup()} />);
    expect(step()).toBeNull();
    cleanup();

    h.linkError = new KeplrUserRejectedError("connect");
    withClient(<GroupMembershipStrip group={validatorGroup()} />);
    expect(screen.getByRole("button", { name: "CONNECT WALLET & VERIFY" })).toBeInTheDocument();
    expect(step()).toBeNull();
  });

  it("also under CHECK & JOIN when a wallet is already linked", () => {
    h.walletItems = [{ verified: true, chain_slug: "cosmos" }];
    h.linkError = new KeplrUnavailableError();
    withClient(<GroupMembershipStrip group={validatorGroup()} />);
    expect(screen.getByRole("button", { name: "CHECK & JOIN" })).toBeInTheDocument();
    expect(linkNames()).toEqual(["Open in Keplr"]);
  });
});

describe("recovery email, the wallet step", () => {
  const wallets = [
    { id: 5, chain_slug: "cosmos", chain_name: "Cosmos Hub", wallet_address: "cosmos1abc", verified: true },
  ] as unknown as LinkedWallet[];

  it("no Keplr on a phone: 'Open in Keplr' for the selected wallet's chain", () => {
    h.recoveryError = new KeplrUnavailableError();
    withClient(<RecoveryEmailForm verifiedWallets={wallets} onClose={vi.fn()} />);
    expect(linkNames()).toEqual(["Open in Keplr"]);
  });

  it("nothing without a 'not installed' error", () => {
    h.recoveryError = new KeplrUserRejectedError("sign");
    withClient(<RecoveryEmailForm verifiedWallets={wallets} onClose={vi.fn()} />);
    expect(step()).toBeNull();
  });
});
