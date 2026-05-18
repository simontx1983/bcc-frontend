/**
 * Vercel Cron relay → WordPress NFT-indexer tick.
 *
 * Why this exists:
 *   The V2 NFT indexer is registered as a WP-Cron hook at 1-minute
 *   intervals. Hostinger Business shared hosting caps real cron
 *   frequency at 5–15 minutes (plan-dependent), so the indexer
 *   silently falls behind there. Vercel Cron supports 1-min schedules
 *   on the free tier; this route receives the cron hit and forwards
 *   a signed POST to the WP /bcc/v1/internal/indexer/tick endpoint.
 *
 * Auth on the inbound side:
 *   Vercel Cron attaches `Authorization: Bearer <CRON_SECRET>` to
 *   every invocation when CRON_SECRET is defined in the project env.
 *   We verify it in constant time before doing any work — manual
 *   curls without the secret get a 401 and never touch WP.
 *
 * Auth on the outbound side:
 *   We attach `X-Bcc-Internal: <BCC_INTERNAL_CRON_SECRET>` to the
 *   POST, matched against the same constant on the WP side. The two
 *   secrets are intentionally separate: CRON_SECRET only Vercel needs;
 *   BCC_INTERNAL_CRON_SECRET only WordPress needs; the relay sees both.
 *
 * Vercel Cron schedules are configured in `vercel.json` at the bcc-frontend
 * root. This route is the GET handler — Vercel Cron uses GET, but the
 * WP endpoint takes POST (the action is non-idempotent from the client
 * perspective: it runs the indexer). The mismatch is intentional and
 * idiomatic for cron-relay routes.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { clientEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";

// Always run on the Node runtime so Buffer + the WP fetch work the same
// way as in local dev. Vercel Edge doesn't add value here and would
// complicate timeout semantics.
export const runtime = "nodejs";

// Vercel free-tier function timeout is 10s — well above the WP
// MAX_RUNTIME_SECONDS budget (20s would actually be too long, but the
// WP endpoint returns as soon as runAllChains exits so a normal tick
// finishes in well under 10s). Cap explicitly so a hung WP doesn't
// pin the Vercel function for the full default.
export const maxDuration = 15;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Step 1: verify the inbound Vercel Cron auth header.
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${serverEnv.CRON_SECRET}`;
  if (!timingSafeEqual(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Step 2: forward a signed POST to WP. The X-Bcc-Internal secret
  // is the wp-config.php constant of the same name.
  const url = `${clientEnv.BCC_API_URL}/wp-json/bcc/v1/internal/indexer/tick`;
  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Bcc-Internal": serverEnv.BCC_INTERNAL_CRON_SECRET,
      },
      body: "{}",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return NextResponse.json(
      { ok: false, error: "Upstream WordPress unreachable.", detail: message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  const elapsedMs = Date.now() - startedAt;

  // Pass through the upstream's body + status so Vercel cron logs show
  // the real WP response. The body is small JSON; reading + re-serialising
  // is fine.
  let upstreamBody: unknown;
  try {
    upstreamBody = await upstream.json();
  } catch {
    upstreamBody = { ok: false, error: "Upstream returned non-JSON body." };
  }

  return NextResponse.json(
    { upstream_status: upstream.status, elapsed_ms: elapsedMs, upstream: upstreamBody },
    { status: upstream.ok ? 200 : 502, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Constant-time string compare. Avoids leaking the length / prefix of
 * the expected secret via response timing on mismatched inputs.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
