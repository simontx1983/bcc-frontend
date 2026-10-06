/**
 * bearer-claims — read the unverified payload of a BCC bearer, for ONE
 * purpose: a consistency check between two tokens this client already
 * holds.
 *
 * ⚠⚠⚠ THIS IS NOT AUTHENTICATION, AND MUST NEVER BE USED AS SUCH.
 *
 * The signature is NOT verified here and cannot be: the signing secret is
 * `wp_salt('auth')` on the server. Anything this module returns is
 * therefore a claim someone *said*, not a fact. It is sound for the single
 * use it has — comparing the token the server just handed us against the
 * token we find in our own session, to decide whether to REFUSE to report
 * success — because:
 *
 *   - both tokens come from our own session plumbing, not from a third
 *     party;
 *   - the only decision it can influence is a refusal. It can never
 *     establish that a session was restored. The caller treats an
 *     unreadable, malformed, mismatched or out-of-range payload exactly
 *     like a refusal;
 *   - so a forged or corrupt payload costs the viewer one unnecessary
 *     "sign in again", never a wrongly-accepted session.
 *
 * If a future caller wants authentication, it has to ask the server.
 *
 * ## What the server mints
 *
 * `JwtToken::encode()` (bcc-trust) emits an HS256 JWT whose payload carries
 * `iss`, `sub` (the user id as a string), `iat`, `exp`, `ver`, `jti`,
 * **`tv`** (the per-user revocation counter), `user_id` (int), `handle`,
 * and optionally `aud`. Only `sub`, `user_id` and `tv` are read here.
 *
 * `tv` is the counter `JwtToken::revokeAllForUser()` bumps. A token whose
 * `tv` is lower than the current counter is already dead server-side
 * (`decode()` answers `jwt_revoked`), and `decodeForRefresh()` shares that
 * gate, so it cannot be refreshed either.
 */

/** The three claims this module is willing to report, all validated. */
export interface BearerConsistencyClaims {
  /** `sub`, non-empty. */
  readonly subject: string;
  /** `user_id`, a positive safe integer. */
  readonly userId: number;
  /** `tv`, a safe integer in [0, TOKEN_VERSION_MAX]. */
  readonly tokenVersion: number;
}

/**
 * Upper bound on an acceptable `tv`.
 *
 * Bounded deliberately: a garbled or hostile payload claiming `1e308` (or
 * `Infinity` via a JSON number) must not be able to pass itself off as
 * "newer than ours". The counter is incremented once per credential
 * rotation for one user, so anything beyond a million is nonsense and is
 * treated as malformed.
 */
export const TOKEN_VERSION_MAX = 1_000_000;

function base64UrlDecode(segment: string): string | null {
  // Reject anything that is not base64url before handing it to atob: a
  // standard-base64 or padded segment is not what the server emits, and
  // guessing at repairs would widen what this module accepts.
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    return null;
  }
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    // The payload is UTF-8 JSON; `atob` yields bytes, so decode properly
    // rather than assuming latin1 (a handle can be non-ASCII).
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Read and validate the three claims, or `null` if anything is off.
 *
 * `null` means "no usable claims", and every caller must treat that the
 * same way it treats a mismatch: as grounds to refuse, never to accept.
 */
export function readBearerConsistencyClaims(
  token: unknown,
): BearerConsistencyClaims | null {
  if (typeof token !== "string" || token === "") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const json = base64UrlDecode(parts[1] ?? "");
  if (json === null) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const { sub, user_id: userId, tv } = payload as {
    sub?: unknown;
    user_id?: unknown;
    tv?: unknown;
  };

  // Subject: present, a non-empty string, and consistent with `user_id`.
  // Both are emitted from the same `$userId`, so a token where they
  // disagree is malformed by construction.
  if (typeof sub !== "string" || sub === "") {
    return null;
  }
  if (typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0) {
    return null;
  }
  if (sub !== String(userId)) {
    return null;
  }

  // Token version: present, a safe integer, non-negative, bounded.
  // ⚠ Absent is MALFORMED here, not zero. Tokens minted before the claim
  // shipped legitimately have no `tv`, and the server treats that as 0 —
  // but this module is not the server, and silently reading "absent" as a
  // comparable 0 would let a claimless token be ranked. The caller refuses
  // instead, which is the safe direction.
  if (typeof tv !== "number" || !Number.isSafeInteger(tv) || tv < 0 || tv > TOKEN_VERSION_MAX) {
    return null;
  }

  return { subject: sub, userId, tokenVersion: tv };
}

/**
 * Does `found` fail the consistency check against `minted`?
 *
 * Returns true only when there is positive reason to refuse:
 *
 *   - either token's claims are unreadable, malformed or out of range;
 *   - they name different subjects;
 *   - `found` carries a LOWER token version than `minted`, which means it
 *     was minted before the revocation that `minted` carries — already
 *     dead server-side.
 *
 * Returns false when the check finds nothing wrong. ⚠ That is NOT a
 * success signal: it means "this evidence does not refute the caller's
 * other evidence". Establishing restoration remains the caller's job.
 */
export function bearerFailsConsistencyCheck(found: unknown, minted: unknown): boolean {
  const mintedClaims = readBearerConsistencyClaims(minted);
  const foundClaims = readBearerConsistencyClaims(found);
  if (mintedClaims === null || foundClaims === null) {
    return true;
  }
  if (foundClaims.subject !== mintedClaims.subject) {
    return true;
  }
  return foundClaims.tokenVersion < mintedClaims.tokenVersion;
}
