/**
 * "Open in wallet app" links: stage 0 of mobile wallet connect (Phillip,
 * 2026-11-24; WalletConnect-style connect is a later stage beside it).
 *
 * A phone has no wallet extension, so the wallet's provider is never
 * injected into the phone's own browser. Each wallet app has a built-in
 * browser that does inject it, and a documented link that opens a given
 * page there. These builders produce those links, one per wallet, each
 * following the wallet's OWN published format (sources inline). The only
 * decision here is which wallets fit a chain type, from the chain
 * catalog's `chainType`.
 *
 * Every builder takes the page URL and refuses anything but http(s), so a
 * crafted value can't become a `javascript:` or app-scheme target.
 *
 * Only origin + path + an allowlist of query keys ever leave the app: a
 * vendor's domain receives the link when its app isn't installed, so a
 * token a future host page carries in its query or #fragment must not
 * ride along. The fragment is always dropped.
 */

import type { WalletChainType } from "@/lib/wallet/chain-catalog";

export type WalletAppId = "keplr" | "phantom" | "solflare" | "metamask";

export interface WalletAppLink {
  id: WalletAppId;
  /** Button text. */
  label: string;
  href: string;
}

/** Which wallet apps can sign for a chain type, in button order. */
export const WALLET_APPS_BY_CHAIN_TYPE: Readonly<Record<WalletChainType, readonly WalletAppId[]>> = {
  cosmos: ["keplr"],
  solana: ["phantom", "solflare"],
  evm: ["metamask"],
  // No documented in-app-browser link in scope yet; the "not installed"
  // message's own hint still applies.
  polkadot: [],
};

const LABELS: Readonly<Record<WalletAppId, string>> = {
  keplr: "Open in Keplr",
  phantom: "Open in Phantom",
  solflare: "Open in Solflare",
  metamask: "Open in MetaMask",
};

/**
 * Query keys a wallet link may carry. `callbackUrl` is /login's
 * same-origin return path; nothing else is needed to land back on the page.
 */
export const FORWARDED_QUERY_KEYS: readonly string[] = ["callbackUrl"];

/**
 * The page as an http(s) URL reduced to origin + path + the allowlisted
 * query keys, with no fragment; or null.
 */
export function shareablePage(pageUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const page = new URL(url.origin + url.pathname);
  for (const key of FORWARDED_QUERY_KEYS) {
    const value = url.searchParams.get(key);
    if (value !== null) page.searchParams.set(key, value);
  }
  return page;
}

/**
 * Keplr: Keplr's own example app, chainapsis/keplr-example,
 * src/components/DeeplinkTab.tsx ("web-browser" → "Open Keplr in App
 * Browser"): `https://deeplink.keplr.app/web-browser?url=${window.origin}`.
 * docs.keplr.app has no page for it. Here the full page URL is passed,
 * encoded as the query value it is.
 */
export function keplrBrowseLink(page: URL): string {
  return `https://deeplink.keplr.app/web-browser?url=${encodeURIComponent(page.href)}`;
}

/**
 * Phantom: https://docs.phantom.com/phantom-deeplinks/other-methods/browse
 * `https://phantom.com/ul/browse/<url>?ref=<ref>`; `url` is the page to
 * open, `ref` the requesting app, both URL-encoded. (Their docs say new
 * links use phantom.com, not phantom.app.)
 */
export function phantomBrowseLink(page: URL): string {
  return `https://phantom.com/ul/browse/${encodeURIComponent(page.href)}?ref=${encodeURIComponent(page.origin)}`;
}

/**
 * Solflare: https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse
 * `https://solflare.com/ul/v1/browse/<url>?ref=<ref>`, both URL-encoded.
 */
export function solflareBrowseLink(page: URL): string {
  return `https://solflare.com/ul/v1/browse/${encodeURIComponent(page.href)}?ref=${encodeURIComponent(page.origin)}`;
}

/**
 * MetaMask: https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks
 * ("Open a dapp inside the MetaMask in-app browser"):
 * `https://link.metamask.io/dapp/{dappUrl}`, documented example
 * `https://link.metamask.io/dapp/app.uniswap.org` (no scheme). The rest
 * of the URL is appended as the URL object serializes it (already
 * percent-encoded). Whether a `?query` survives MetaMask's link service
 * isn't documented; that needs a real-phone check.
 */
export function metamaskDappLink(page: URL): string {
  return `https://link.metamask.io/dapp/${page.host}${page.pathname}${page.search}${page.hash}`;
}

const BUILDERS: Readonly<Record<WalletAppId, (page: URL) => string>> = {
  keplr: keplrBrowseLink,
  phantom: phantomBrowseLink,
  solflare: solflareBrowseLink,
  metamask: metamaskDappLink,
};

/** The wallet-app links for this chain type and page; [] when none apply. */
export function walletAppLinksFor(chainType: WalletChainType, pageUrl: string): WalletAppLink[] {
  const page = shareablePage(pageUrl);
  if (page === null) return [];
  return (WALLET_APPS_BY_CHAIN_TYPE[chainType] ?? []).map((id) => ({
    id,
    label: LABELS[id],
    href: BUILDERS[id](page),
  }));
}
