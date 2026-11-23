/**
 * Wallet error copy shared by every adapter (keplr, metamask, phantom,
 * polkadot), so the four never drift. F-316 M-cl2 (UX scan claims):
 *
 *   - A wallet's own error text is never shown. Extensions return
 *     anything from "Request rejected" to internal stack-ish strings; the
 *     adapters keep the original as the error's `cause` (for debugging)
 *     and show WALLET_FAILED_COPY.
 *   - Declining the CONNECT prompt is not "signing was canceled": the
 *     member never got as far as signing. The rejected errors carry the
 *     stage they happened at.
 *   - "Not installed" says what to do on a phone, where there is no
 *     extension to install: open the page in the wallet app's browser.
 */

export type WalletStage = "connect" | "sign";

export const WALLET_FAILED_COPY =
  "Your wallet couldn't finish that. Open it, check it's unlocked, and try again.";

export function walletRejectedCopy(stage: WalletStage): string {
  return stage === "connect" ? "You declined the wallet connection." : "Wallet signing was canceled.";
}

export const MOBILE_WALLET_HINT =
  "On a phone, open this page in your wallet app's built-in browser.";
