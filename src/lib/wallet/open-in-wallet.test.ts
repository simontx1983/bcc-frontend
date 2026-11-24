/**
 * "Open in wallet app" link builders: each wallet's own documented format
 * (sources in open-in-wallet.ts), the right wallets per chain type, and a
 * page URL that survives the round trip however awkward it is.
 */

import { describe, expect, it } from "vitest";

import {
  WALLET_APPS_BY_CHAIN_TYPE,
  walletAppLinksFor,
  type WalletAppLink,
} from "@/lib/wallet/open-in-wallet";

// A sign-in page carrying its own encoded callback, a second param, a
// space and a fragment: everything a naive concatenation gets wrong.
const PAGE = "https://bluecollarcrypto.io/login?callbackUrl=%2Fv%2Facme&x=a b#claim";
// What the URL parser normalises it to (the space becomes %20).
const HREF = "https://bluecollarcrypto.io/login?callbackUrl=%2Fv%2Facme&x=a%20b#claim";
const ORIGIN = "https://bluecollarcrypto.io";

const byId = (links: WalletAppLink[]) => Object.fromEntries(links.map((l) => [l.id, l]));

describe("the documented link formats", () => {
  it("Keplr: deeplink.keplr.app/web-browser?url=<encoded page>", () => {
    const { keplr } = byId(walletAppLinksFor("cosmos", PAGE));
    expect(keplr?.href).toBe(`https://deeplink.keplr.app/web-browser?url=${encodeURIComponent(HREF)}`);
    expect(keplr?.label).toBe("Open in Keplr");
  });

  it("Phantom: phantom.com/ul/browse/<encoded page>?ref=<encoded origin>", () => {
    const { phantom } = byId(walletAppLinksFor("solana", PAGE));
    expect(phantom?.href).toBe(
      `https://phantom.com/ul/browse/${encodeURIComponent(HREF)}?ref=${encodeURIComponent(ORIGIN)}`,
    );
  });

  it("Solflare: solflare.com/ul/v1/browse/<encoded page>?ref=<encoded origin>", () => {
    const { solflare } = byId(walletAppLinksFor("solana", PAGE));
    expect(solflare?.href).toBe(
      `https://solflare.com/ul/v1/browse/${encodeURIComponent(HREF)}?ref=${encodeURIComponent(ORIGIN)}`,
    );
  });

  it("MetaMask: link.metamask.io/dapp/<host + path, no scheme>", () => {
    const { metamask } = byId(walletAppLinksFor("evm", PAGE));
    expect(metamask?.href).toBe("https://link.metamask.io/dapp/bluecollarcrypto.io/login?callbackUrl=%2Fv%2Facme&x=a%20b#claim");
  });
});

describe("encoding", () => {
  it("the page URL round-trips out of each query-style link intact", () => {
    for (const link of [...walletAppLinksFor("cosmos", PAGE), ...walletAppLinksFor("solana", PAGE)]) {
      const parsed = new URL(link.href);
      const carried = link.id === "keplr"
        ? parsed.searchParams.get("url")
        : decodeURIComponent(parsed.pathname.replace(/^\/ul\/(v1\/)?browse\//, ""));
      expect(carried, link.id).toBe(HREF);
      if (link.id !== "keplr") expect(parsed.searchParams.get("ref"), link.id).toBe(ORIGIN);
    }
  });

  it("nothing from the page leaks into a link's own query unencoded", () => {
    const { keplr, phantom, solflare } = {
      ...byId(walletAppLinksFor("cosmos", PAGE)),
      ...byId(walletAppLinksFor("solana", PAGE)),
    };
    for (const link of [keplr, phantom, solflare]) {
      const parsed = new URL(link?.href ?? "");
      expect(parsed.searchParams.get("callbackUrl")).toBeNull();
      expect(parsed.searchParams.get("x")).toBeNull();
      expect(parsed.hash).toBe("");
    }
  });

  it("refuses anything but an http(s) page", () => {
    expect(walletAppLinksFor("cosmos", "javascript:alert(1)")).toEqual([]);
    expect(walletAppLinksFor("solana", "keplrwallet://x")).toEqual([]);
    expect(walletAppLinksFor("evm", "not a url")).toEqual([]);
  });
});

describe("only the wallets for the page's chain type", () => {
  it("cosmos → Keplr; solana → Phantom, Solflare; evm → MetaMask; polkadot → none", () => {
    expect(walletAppLinksFor("cosmos", PAGE).map((l) => l.id)).toEqual(["keplr"]);
    expect(walletAppLinksFor("solana", PAGE).map((l) => l.id)).toEqual(["phantom", "solflare"]);
    expect(walletAppLinksFor("evm", PAGE).map((l) => l.id)).toEqual(["metamask"]);
    expect(walletAppLinksFor("polkadot", PAGE)).toEqual([]);
    expect(Object.keys(WALLET_APPS_BY_CHAIN_TYPE).sort()).toEqual(["cosmos", "evm", "polkadot", "solana"]);
  });

  it("every link is an https universal link on the wallet's own domain", () => {
    const hosts = [
      ...walletAppLinksFor("cosmos", PAGE),
      ...walletAppLinksFor("solana", PAGE),
      ...walletAppLinksFor("evm", PAGE),
    ].map((l) => new URL(l.href));
    expect(hosts.map((u) => u.protocol)).toEqual(["https:", "https:", "https:", "https:"]);
    expect(hosts.map((u) => u.host)).toEqual([
      "deeplink.keplr.app",
      "phantom.com",
      "solflare.com",
      "link.metamask.io",
    ]);
  });
});
