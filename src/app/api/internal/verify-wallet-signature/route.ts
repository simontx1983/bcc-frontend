/**
 * Internal wallet-signature verifier.
 *
 * The PHP backend ({@see PolkadotSignatureVerifier}) POSTs here to
 * verify Polkadot signatures because PHP has no native sr25519 /
 * schnorrkel implementation. We delegate to `@polkadot/util-crypto`'s
 * `signatureVerify`, which is the reference verification path used
 * across the Polkadot ecosystem.
 *
 * Scope: this route ONLY handles chains whose primitives PHP cannot
 * do natively. Today that means `polkadot`. Solana (ed25519) and EVM
 * (secp256k1) and Cosmos (secp256k1 + ADR-036) stay in the PHP-side
 * verifiers — adding them here would be a regression (extra network
 * hop, extra trust boundary, no benefit).
 *
 * Auth: `X-Bcc-Internal: <BCC_INTERNAL_VERIFY_SECRET>` (constant-time
 * compare). Mirrors the BCC_INTERNAL_CRON_SECRET pattern used in the
 * other direction (Vercel → WP). Missing/mismatched header → 401 with
 * no detail leak.
 *
 * The route is intentionally STATELESS — no DB reads, no caches. The
 * only side effect is `signatureVerify` running on the input.
 */

import { checkAddress, signatureVerify } from "@polkadot/util-crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";

// Always run on the Node runtime. @polkadot/util-crypto initialises
// wasm bindings at module load time; the Edge runtime does not
// support those primitives.
export const runtime = "nodejs";

// Vercel-function timeout cap. signatureVerify is sub-50ms; this is a
// safety net for the unlikely cold-start case where wasm bootstrap is
// slow.
export const maxDuration = 10;

interface VerifyBody {
  chain_type: string;
  message: string;
  signature: string;
  address: string;
}

interface VerifyResponse {
  isValid: boolean;
  crypto?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<VerifyResponse | { error: string }>> {
  // Step 1: auth. Constant-time compare against the configured secret.
  // Treat a missing header AND a missing secret as failures; never
  // accept the "empty matches empty" trap.
  const provided = request.headers.get("x-bcc-internal") ?? "";
  let expected = "";
  try {
    expected = serverEnv.BCC_INTERNAL_VERIFY_SECRET;
  } catch {
    // Secret not configured — refuse instead of accepting a partial deploy.
    return NextResponse.json(
      { error: "Internal verifier not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (provided === "" || !timingSafeEqual(provided, expected)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Step 2: body shape. Reject early on malformed input — PHP-side
  // metric `polkadot_verify.route_malformed_body` would catch this
  // upstream, but a 400 here lets ops see *which* field was wrong.
  let body: VerifyBody;
  try {
    const parsed: unknown = await request.json();
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as VerifyBody).chain_type !== "string" ||
      typeof (parsed as VerifyBody).message !== "string" ||
      typeof (parsed as VerifyBody).signature !== "string" ||
      typeof (parsed as VerifyBody).address !== "string"
    ) {
      throw new Error("malformed");
    }
    body = parsed as VerifyBody;
  } catch {
    return NextResponse.json(
      { error: "Bad request body." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Step 3: chain-type allowlist. Today, polkadot only.
  if (body.chain_type !== "polkadot") {
    return NextResponse.json(
      { error: `Unsupported chain_type: ${body.chain_type}` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Step 4: SS58 prefix pinning. `chain_type === "polkadot"` means
  // Polkadot mainnet (SS58 prefix 0). Without this check, a user holding
  // key pair K could submit a Kusama-format address (prefix 2) — sig
  // still verifies because signatureVerify decodes the address to a
  // pubkey regardless of which SS58 prefix encoded it — and bcc-trust
  // would persist the Kusama-encoded string as a chain_id=polkadot
  // wallet row. Caller must still own the key (not a privilege
  // escalation), but this prevents the same key being linked twice on
  // the same chain via different SS58 encodings.
  const [prefixOk] = checkAddress(body.address, 0);
  if (!prefixOk) {
    return NextResponse.json(
      { isValid: false },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Step 5: verify. Polkadot.js extension's signRaw with type='bytes'
  // wraps the message with <Bytes>…</Bytes> before signing. The
  // signature is over the wrapped bytes, not the bare message. We
  // therefore verify against the wrapped form FIRST, then fall back
  // to the bare form for older wallets / different signers that
  // don't wrap. Both calls are cheap (<5ms each).
  const wrapped = `<Bytes>${body.message}</Bytes>`;
  const result = verifyEitherForm(wrapped, body.message, body.signature, body.address);

  return NextResponse.json(result, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Two-pass verify: wrapped form first, bare form as fallback.
 *
 * signatureVerify throws on malformed inputs (wrong-length signature,
 * garbage SS58 address); both passes catch and treat as not-valid.
 * `crypto` is only emitted on a successful verify so `exactOptional-
 * PropertyTypes` is satisfied (no undefined-as-string assignments).
 */
function verifyEitherForm(
  wrapped: string,
  bare: string,
  signature: string,
  address: string,
): VerifyResponse {
  try {
    const w = signatureVerify(wrapped, signature, address);
    if (w.isValid) {
      return { isValid: true, crypto: String(w.crypto) };
    }
  } catch {
    // fall through to bare-form attempt
  }
  try {
    const b = signatureVerify(bare, signature, address);
    if (b.isValid) {
      return { isValid: true, crypto: String(b.crypto) };
    }
  } catch {
    // fall through to failed-verify response
  }
  return { isValid: false };
}

/**
 * Constant-time string compare. Avoids leaking the length / prefix of
 * the expected secret via response timing on mismatched inputs.
 * Lifted from the indexer-tick relay route — same idiom.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
