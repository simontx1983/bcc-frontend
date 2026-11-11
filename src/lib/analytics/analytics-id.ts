/**
 * analytics-id — the pseudonymous id analytics identifies a signed-in
 * viewer with. SERVER-ONLY: it reads a server secret and must never be
 * imported by client code (lib/auth.ts, the NextAuth session callback,
 * is its one caller).
 *
 * An unsalted hash of a small sequential integer is reversible: hash 1..N
 * and compare. So the id is HMAC-SHA256 keyed with ANALYTICS_ID_SECRET,
 * which never leaves the server. Without the secret there is NO id, and
 * the client stays anonymous rather than falling back to anything
 * reversible.
 */

import { createHmac } from "node:crypto";

import { serverEnv } from "@/lib/env";

/** Domain separation, so this keyed hash can never collide with another use of the secret. */
const CONTEXT = "bcc-analytics-id:v1:";

export function analyticsIdFor(userId: string): string | null {
  if (userId === "") return null;
  const secret = serverEnv.ANALYTICS_ID_SECRET;
  if (secret === null) return null;
  return createHmac("sha256", secret).update(CONTEXT + userId).digest("hex");
}
