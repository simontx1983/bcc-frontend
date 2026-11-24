"use client";

/**
 * "Open in wallet app": stage 0 of mobile wallet connect.
 *
 * Shown by a wallet surface after a "not installed" error, and only on a
 * touch-only device (a phone has no wallet extension, so the error is a
 * dead end there). Each button opens THIS page inside the wallet app's
 * built-in browser, where the wallet is injected; the member signs in to
 * BCC again there, so the copy says so.
 *
 * Self-contained: a host passes the chain type and decides when to mount
 * it; a later WalletConnect-style stage can sit beside it. Colours inherit
 * from the host, so it reads on paper and panel surfaces alike.
 */

import { useId, useSyncExternalStore } from "react";

import { useTouchOnly } from "@/hooks/useTouchOnly";
import type { WalletChainType } from "@/lib/wallet/chain-catalog";
import { walletAppLinksFor } from "@/lib/wallet/open-in-wallet";

export const OPEN_IN_WALLET_HEADING = "Open this page in your wallet app";
export const OPEN_IN_WALLET_SIGN_IN_AGAIN = "You'll need to sign in to BCC again inside the wallet app.";

function subscribeNever(): () => void {
  return () => {};
}

/** The current page, read on the client only (null during SSR). */
function usePageUrl(): string | null {
  return useSyncExternalStore(subscribeNever, () => window.location.href, () => null);
}

export function OpenInWalletApp({ chainType }: { chainType: WalletChainType }) {
  const touchOnly = useTouchOnly();
  const pageUrl = usePageUrl();
  const headingId = useId();
  if (!touchOnly || pageUrl === null) return null;
  const links = walletAppLinksFor(chainType, pageUrl);
  if (links.length === 0) return null;

  return (
    <div role="group" aria-labelledby={headingId} className="mt-3 flex flex-col gap-1" data-testid="open-in-wallet-app">
      <p id={headingId} className="bcc-mono text-[11px] tracking-[0.12em]">
        {OPEN_IN_WALLET_HEADING}
      </p>
      <div className="flex flex-wrap gap-x-4">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.href}
            rel="noopener noreferrer"
            className="bcc-mono inline-flex min-h-[44px] items-center text-[11px] tracking-[0.12em] underline underline-offset-2"
          >
            {link.label}
          </a>
        ))}
      </div>
      <p className="font-serif text-sm">{OPEN_IN_WALLET_SIGN_IN_AGAIN}</p>
    </div>
  );
}
