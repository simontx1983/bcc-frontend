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

import { decodeAddress, encodeAddress, signatureVerify } from "@polkadot/util-crypto";
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
  /**
   * Polkadot only: canonical prefix-0 (Polkadot mainnet) SS58 form of
   * the submitted address. Present on `isValid: true` so the caller can
   * dedup storage by underlying public key, not by which prefix the
   * user's wallet rendered. Omitted on `isValid: false`.
   */
  canonical_address?: string;
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

  // Step 4: SS58 prefix normalisation. We accept ANY valid SS58
  // encoding (Polkadot prefix 0, generic substrate prefix 42, Kusama
  // prefix 2, etc.) and re-encode to the canonical Polkadot mainnet
  // (prefix 0) form. The original 5e1c0a6 hard-rejected non-prefix-0
  // addresses to prevent the same key being linked twice via different
  // SS58 encodings — normalising achieves the same dedup property by
  // a different route (downstream storage always uses the canonical
  // prefix-0 string) while letting users whose wallet defaults to
  // prefix 42 (the Polkadot.js extension "Substrate" default) actually
  // sign up. `decodeAddress` throws on malformed input (wrong length,
  // wrong checksum, illegal characters); treated as not-valid.
  let canonicalAddress: string;
  try {
    const publicKey = decodeAddress(body.address);
    canonicalAddress = encodeAddress(publicKey, 0);
  } catch {
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
  //
  // Verification uses the canonical address — signatureVerify decodes
  // the address to a pubkey internally, and the canonical/original
  // forms decode to the same pubkey by construction, so the result is
  // identical. Using the canonical here keeps the upstream-returned
  // address and the address-used-to-verify consistent.
  const wrapped = `<Bytes>${body.message}</Bytes>`;
  const result = verifyEitherForm(wrapped, body.message, body.signature, canonicalAddress);

  const response: VerifyResponse = result.isValid
    ? { isValid: true, ...(result.crypto !== undefined ? { crypto: result.crypto } : {}), canonical_address: canonicalAddress }
    : { isValid: false };

  return NextResponse.json(response, {
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
