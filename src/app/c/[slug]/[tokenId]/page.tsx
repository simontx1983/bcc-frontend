/**
 * /c/[slug]/[tokenId] — single NFT-piece detail page (V2 Phase 6 / §H1).
 *
 * Per §4.17 the BE endpoint is keyed on (chainSlug, contractAddress,
 * tokenId) — not (creator-slug, tokenId). The frontend route URL only
 * carries the creator-slug + tokenId, so `chain` and `contract` ride
 * along as searchParams populated by the gallery thumbnail click. When
 * either is missing or empty we 404 (the URL is meaningless without
 * them — typing this URL by hand never resolves).
 *
 * Decision rationale: a BE creator-slug-aware resolver endpoint
 * (`GET /creators/:slug/pieces/:tokenId/route` → 302 → canonical
 * `(chain, contract)` URL) would let the URL stand alone, but that
 * resolver is a Phase 7 phase-shift the contract doesn't have yet. The
 * `searchParams` option ships today against the surface BE just landed.
 *
 * Server component. Fetches via `getNftPiece(...)` with the viewer's
 * session token (forwarded for forward-compat — V2 Phase 6 has no
 * viewer-aware fields). 404s on `bcc_not_found`. Other errors bubble
 * up to the Next error boundary.
 */

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { NftPieceDetail } from "@/components/creator/NftPieceDetail";
import { authOptions } from "@/lib/auth";
import { getNftPiece } from "@/lib/api/nft-pieces-endpoints";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  // Next 15 App Router: params + searchParams are async per the routes contract.
  params: Promise<{ slug: string; tokenId: string }>;
  searchParams: Promise<{ chain?: string; contract?: string }>;
}

export default async function NftPiecePage({ params, searchParams }: PageProps) {
  const { slug, tokenId } = await params;
  const sp = await searchParams;
  const chain = sp.chain ?? "";
  const contract = sp.contract ?? "";

  // The route shape requires chain + contract from the gallery's click
  // payload. Direct-typed URLs without them are unresolvable; surface
  // a real 404 rather than a 422 from the BE so the user sees the same
  // "no such piece" page as a genuinely missing token.
  if (chain === "" || contract === "") {
    notFound();
  }

  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  let piece;
  try {
    piece = await getNftPiece(chain, contract, tokenId, token);
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  // `slug` is the creator-handle namespace from the URL. We pass it to
  // the detail component so the back-breadcrumb can prefer the URL's
  // entry path over `collection.creator_handle` when they disagree
  // (e.g., creator handle was rotated since the gallery cached the link).
  return <NftPieceDetail piece={piece} routeCreatorSlug={slug} />;
}
