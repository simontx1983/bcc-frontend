/**
 * Typed wrapper for `GET /bcc/v1/me/validator-pages` (contract §4) —
 * the operator dashboard's only data source.
 *
 * Returns every validator page the signed-in member holds a VERIFIED
 * operator claim on, across every chain. One account can hold as many
 * as it can prove: the claims table's only uniqueness is
 * `(user_id, entity_type, entity_id)`, so nothing caps a member at one
 * validator page and this client must never assume otherwise.
 *
 * Server-component callers pass `token` (the NextAuth session bearer);
 * the server-safe `bccFetch` (not `bccFetchAsClient`) is the right
 * primitive for server-side rendering. As with `me-reliability-endpoints`,
 * we deliberately ship NO React Query hook: the dashboard is a server
 * component, so client re-fetching would add races with no UX benefit.
 *
 * Response types are declared locally rather than in the shared
 * `types.ts` — the established alternative convention (see
 * account-endpoints, auth-endpoints, endorse-endpoints).
 */

import { bccFetch } from "@/lib/api/client";

/** Chain identity for one claimed page. Values may be null when the
 *  validator row's chain row is absent. */
export interface MeValidatorPageChain {
  slug: string | null;
  name: string | null;
  /** `cosmos` | `evm` | `solana` | `polkadot` as the backend reports it. */
  type: string | null;
}

export interface MeValidatorPageValidator {
  id: number;
  moniker: string | null;
  operator_address: string;
}

export interface MeValidatorPageRow {
  /** Always `"operator"` on this route. */
  claim_role: string;
  /** Always `"verified"` on this route. */
  claim_status: string;
  /**
   * The public page. **null** means the claim is held but the page is
   * missing — rendered as a discrepancy rather than dropped.
   */
  page_id: number | null;
  /**
   * `wp_posts.post_name`, frozen at mint. ⚠ Never rebuild this from the
   * current moniker; monikers drift and the slug does not follow.
   */
  page_slug: string | null;
  chain: MeValidatorPageChain;
  validator: MeValidatorPageValidator;
  /**
   * ⚠⚠ NOT A MEMBERSHIP CLAIM. The last status a provider reported for
   * this validator. It cannot establish whether the validator is in its
   * chain's current active set:
   *
   *   - it freezes for a row the index fetch stops returning;
   *   - `"inactive"` does NOT mean "absent from the fetch" — the Solana
   *     fetcher merges `current` and `delinquent` into one list and
   *     labels the delinquent ones `inactive`, so there it means PRESENT;
   *   - enrichment and the wallet-link path can write it at a time
   *     unrelated to any fetch.
   *
   * ⛔ Do not render an "in the active set" / "not in the current set"
   * badge from this field. Contract §4 says the same.
   */
  chain_reported_status: string;
}

export interface MeValidatorPagesResponse {
  items: MeValidatorPageRow[];
  /** Length of `items`, not a database-wide count. Read is capped at 100. */
  total: number;
}

/**
 * Fetch the signed-in member's claimed validator pages.
 *
 * Anonymous callers get `bcc_unauthorized` 401 from the backend; the
 * page redirects to the login flow before reaching here.
 */
export function getMeValidatorPages(
  token: string | null,
  signal?: AbortSignal,
): Promise<MeValidatorPagesResponse> {
  return bccFetch<MeValidatorPagesResponse>("me/validator-pages", {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}
