/**
 * Can this member add a recovery email right now? (F-332, bcc-trust #658)
 *
 * The server decides; this only reads `recovery.available_at` /
 * `recovery.available_reason` off GET /wallets and maps them to what the
 * onboarding step shows. Pure, and evaluated at RENDER time with the
 * current clock — never a clock captured at mount, which locked out the
 * very member the step is for: after a wallet signup the server answers
 * `available_at = now` with reason "signup_wallet", and a mount-time clock
 * a second behind it read that as "later".
 *
 * Rules:
 *  - fields absent (older backend)                    → open
 *  - reason "signup_wallet"                           → open, always
 *  - reason "wallet_age" with available_at            → open within a
 *    2-minute tolerance (server/client clock skew), else "later"
 *  - both null while has_recovery_email is false      → "relogin"
 *  - any other partial combination                    → open (the server
 *    still enforces; the form surfaces its error)
 */

import type { MyWalletsResponse } from "@/lib/api/types";

/** Clock-skew allowance for a "wallet_age" opening time. */
export const RECOVERY_AVAILABILITY_TOLERANCE_MS = 120_000;

export type RecoveryAvailability =
  | { kind: "open" }
  | { kind: "later"; at: string }
  | { kind: "relogin" };

export function recoveryAvailability(
  recovery: MyWalletsResponse["recovery"] | undefined,
  nowMs: number,
): RecoveryAvailability {
  if (recovery === undefined) return { kind: "open" };
  const at = recovery.available_at;
  const reason = recovery.available_reason;
  if (at === undefined && reason === undefined) return { kind: "open" };
  if (reason === "signup_wallet") return { kind: "open" };
  if (reason === "wallet_age" && typeof at === "string") {
    const opensAt = Date.parse(at);
    if (Number.isNaN(opensAt)) return { kind: "open" };
    return opensAt - nowMs <= RECOVERY_AVAILABILITY_TOLERANCE_MS
      ? { kind: "open" }
      : { kind: "later", at };
  }
  if (reason === null && at === null && !recovery.has_recovery_email) {
    return { kind: "relogin" };
  }
  return { kind: "open" };
}
