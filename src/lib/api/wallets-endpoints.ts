/**
 * §V1.5 — typed wrappers for /wallets (linked-wallet management).
 *
 * Backend: WalletController @ /wp-json/bcc/v1/wallets. Standard BCC
 * envelope (`{data, _meta}`). Auth required — bearer JWT.
 *
 * Linking new wallets is a separate flow (§N8 wallet challenge +
 * /auth/wallet-link in auth-endpoints.ts) — this file only covers
 * the listing + unlink surface that /settings/identity needs.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  MyWalletsResponse,
  UnlinkWalletResponse,
} from "@/lib/api/types";

export function getMyWallets(signal?: AbortSignal): Promise<MyWalletsResponse> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<MyWalletsResponse>("wallets", init);
}

/**
 * DELETE /wallets/:id. Idempotent — `removed=false` when the id is
 * unknown or already deleted.
 */
export function unlinkWallet(walletId: number): Promise<UnlinkWalletResponse> {
  return bccFetchAsClient<UnlinkWalletResponse>(`wallets/${walletId}`, {
    method: "DELETE",
  });
}
