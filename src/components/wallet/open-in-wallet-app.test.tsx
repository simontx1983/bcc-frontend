/**
 * "Open in wallet app" (stage 0 of mobile connect): the step itself, and
 * the sign-in/sign-up button and the claim flow showing it.
 *
 * It appears only after a "not installed" error and only on a touch-only
 * device (a controllable matchMedia stands in for the pointer). Each link
 * carries THIS page, and the member is told they'll sign in again there.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as DispatchModule from "@/lib/wallet/dispatch";

const pointer = vi.hoisted(() => ({ touchOnly: true }));
const h = vi.hoisted(() => ({ connect: vi.fn(), sign: vi.fn(), nonce: vi.fn(), signIn: vi.fn() }));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/v/acme",
}));
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => h.signIn(...a) }));
vi.mock("@/lib/api/auth-endpoints", () => ({
  getPublicWalletNonce: (...a: unknown[]) => h.nonce(...a),
  walletSignup: vi.fn(),
  getWalletNonce: vi.fn(),
  linkWallet: vi.fn(),
}));
vi.mock("@/lib/api/wallets-endpoints", () => ({ getMyWallets: vi.fn(async () => ({ items: [] })) }));
vi.mock("@/lib/api/pages-endpoints", () => ({ claimPage: vi.fn() }));
vi.mock("@/lib/wallet/dispatch", async (importActual) => ({
  ...(await importActual<typeof DispatchModule>()),
  connectWallet: (...a: unknown[]) => h.connect(...a),
  signWalletChallenge: (...a: unknown[]) => h.sign(...a),
}));

const { OpenInWalletApp, OPEN_IN_WALLET_HEADING, OPEN_IN_WALLET_SIGN_IN_AGAIN } = await import(
  "@/components/wallet/OpenInWalletApp"
);
const { WalletAuthButton } = await import("@/components/auth/WalletAuthButton");
const { ClaimFlow } = await import("@/components/claim/ClaimFlow");
const { KeplrUnavailableError, KeplrUserRejectedError } = await import("@/lib/wallet/keplr");
const { walletAppLinksFor } = await import("@/lib/wallet/open-in-wallet");

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
});
afterEach(cleanup);

const step = () => screen.queryByRole("group", { name: OPEN_IN_WALLET_HEADING });
const linkNames = () =>
  within(step() as HTMLElement).getAllByRole("link").map((a) => a.textContent);

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe("OpenInWalletApp", () => {
  it("on a phone: the chain type's wallets, each opening THIS page, and the sign-in-again note", () => {
    render(<OpenInWalletApp chainType="solana" />);
    expect(linkNames()).toEqual(["Open in Phantom", "Open in Solflare"]);
    const expected = walletAppLinksFor("solana", window.location.href);
    expect(screen.getByRole("link", { name: "Open in Phantom" })).toHaveAttribute("href", expected[0]?.href);
    expect(screen.getByRole("link", { name: "Open in Solflare" })).toHaveAttribute("href", expected[1]?.href);
    expect(screen.getByText(OPEN_IN_WALLET_SIGN_IN_AGAIN)).toBeInTheDocument();
    expect(OPEN_IN_WALLET_SIGN_IN_AGAIN).toBe("You'll need to sign in to BCC again inside the wallet app.");
  });

  it("cosmos → Keplr only; evm → MetaMask only", () => {
    render(<OpenInWalletApp chainType="cosmos" />);
    expect(linkNames()).toEqual(["Open in Keplr"]);
    cleanup();
    render(<OpenInWalletApp chainType="evm" />);
    expect(linkNames()).toEqual(["Open in MetaMask"]);
  });

  it("polkadot has no documented wallet link: nothing renders", () => {
    const { container } = render(<OpenInWalletApp chainType="polkadot" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("on a desktop (a fine pointer) nothing renders", () => {
    pointer.touchOnly = false;
    installPointer();
    const { container } = render(<OpenInWalletApp chainType="cosmos" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("each link is a 44px target", () => {
    render(<OpenInWalletApp chainType="solana" />);
    for (const a of within(step() as HTMLElement).getAllByRole("link")) {
      expect(a.className).toContain("min-h-[44px]");
    }
  });
});

describe("WalletAuthButton", () => {
  const signInWithKeplrChain = () => {
    render(<WalletAuthButton mode="login" onSuccess={vi.fn()} initialChainSlug="cosmos" />);
    fireEvent.click(screen.getByRole("button", { name: /Sign in with wallet/i }));
  };

  it("a phone with no Keplr gets 'Open in Keplr' under the error", async () => {
    h.connect.mockRejectedValue(new KeplrUnavailableError());
    signInWithKeplrChain();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Keplr isn't installed");
    expect(linkNames()).toEqual(["Open in Keplr"]);
  });

  it("not on a desktop, and not for other errors", async () => {
    pointer.touchOnly = false;
    installPointer();
    h.connect.mockRejectedValue(new KeplrUnavailableError());
    signInWithKeplrChain();
    await flush();
    expect(step()).toBeNull();
    cleanup();

    pointer.touchOnly = true;
    installPointer();
    h.connect.mockRejectedValue(new KeplrUserRejectedError("connect"));
    signInWithKeplrChain();
    await flush();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(step()).toBeNull();
  });

  it("goes away when the next attempt starts", async () => {
    h.connect.mockRejectedValueOnce(new KeplrUnavailableError()).mockReturnValueOnce(new Promise(() => {}));
    signInWithKeplrChain();
    await flush();
    expect(step()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Sign in with wallet/i }));
    await flush();
    expect(step()).toBeNull();
  });
});

describe("ClaimFlow, the connect step", () => {
  it("a phone with no Keplr gets 'Open in Keplr' beside the install link", async () => {
    h.connect.mockRejectedValue(new KeplrUnavailableError());
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ClaimFlow
          pageId={7}
          pageName="Acme"
          target={{ entity_type: "validator", entity_id: 42, chain_slug: "cosmos", claimable: true }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
    await flush();
    expect(screen.getByRole("link", { name: /Get Keplr/ })).toBeInTheDocument();
    expect(linkNames()).toEqual(["Open in Keplr"]);
  });
});
