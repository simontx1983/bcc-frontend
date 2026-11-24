/**
 * Whether a validator page can be claimed — the SERVER's answer (F-552).
 *
 * Contract F-515: a page card's `claim_target` carries `claimable` and,
 * when false, `unclaimable_hint` (server copy naming the chain), and
 * `permissions.can_claim` answers `not_claimable` with the same hint,
 * checked first. Clients decide claimability from these fields, never from
 * a chain allowlist of their own; the old `lib/wallet/claim-support.ts`
 * allowlist is gone.
 *
 * An older backend sends neither field. Then this says "claimable" and the
 * claim route decides, as it always has.
 */

import type { CardClaimTarget, CardPermissionEntry } from "@/lib/api/types";

/**
 * The server says the page is claimable, but this frontend has no wallet
 * for its chain (WALLET_CHAIN_CATALOG). A wallet-capability fact the
 * frontend owns, not a claimability allowlist (RA2's M1 on #384, kujira).
 */
export const NO_WALLET_FOR_CHAIN_COPY = "We can't connect a wallet for this chain yet.";

/** Only when the server says "not claimable" but sends no reason of its own. */
export const UNCLAIMABLE_FALLBACK_COPY =
  "This page can't be claimed: BCC can't prove who operates this validator from the data it stores.";

export interface Claimability {
  claimable: boolean;
  /** The server's reason, verbatim; null when claimable. */
  hint: string | null;
}

export function claimabilityOf(
  target: Pick<CardClaimTarget, "claimable" | "unclaimable_hint">,
  canClaim?: CardPermissionEntry | undefined,
): Claimability {
  const notClaimableByPermission = canClaim?.reason_code === "not_claimable";
  if (target.claimable !== false && !notClaimableByPermission) {
    return { claimable: true, hint: null };
  }
  const serverHint =
    target.unclaimable_hint ?? (notClaimableByPermission ? canClaim?.unlock_hint ?? null : null);
  return {
    claimable: false,
    hint: serverHint !== null && serverHint.trim() !== "" ? serverHint : UNCLAIMABLE_FALLBACK_COPY,
  };
}
