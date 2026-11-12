/**
 * NftPieceDetail hero — F-165 fallback chain on BOTH layers, and the
 * accessible name announced exactly once.
 *
 * The hero layers a thumb under the full image. Each layer walks its own
 * chain (image_url_thumb → image_url_thumb_fallback_url → "No artwork";
 * image_url → image_fallback_url → nothing). The case that motivated this
 * file: the thumb is exhausted (so its "No artwork" placeholder carries
 * the piece name as role="img") and THEN the full image loads over it —
 * without aria-hidden on the placeholder, a screen reader announced the
 * name twice.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

import { NftPieceDetail } from "@/components/creator/NftPieceDetail";
import type { NftPiece } from "@/lib/api/types";

const THUMB = "https://gateway.example/ipfs/bafythumb";
const THUMB_FB = "https://ipfs.io/ipfs/bafythumb";
const FULL = "https://gateway.example/ipfs/bafyfull";
const FULL_FB = "https://ipfs.io/ipfs/bafyfull";

function piece(overrides: Partial<NftPiece> = {}): NftPiece {
  return {
    id: "ethereum:0xabc:7",
    collection: {
      id: 1,
      name: "Demo",
      creator_handle: null,
      chain_slug: "ethereum",
      contract_address: "0xabc",
      token_standard: "ERC-721",
      is_verified: false,
    },
    token_id: "7",
    name: "Piece 7",
    description: null,
    image_url: FULL,
    image_fallback_url: FULL_FB,
    image_url_thumb: THUMB,
    image_url_thumb_fallback_url: THUMB_FB,
    attributes: [],
    owner: null,
    owners_count: 0,
    owners: [],
    marketplace_links: [],
    mint_link: null,
    permissions: {},
    meta: {
      read_time: false,
      indexer_state: {},
      indexer_state_label: {},
      owners_summary_label: null,
    },
    ...overrides,
  };
}

function imgBySrc(src: string): HTMLImageElement | null {
  return document.querySelector(`img[src="${src}"]`);
}

afterEach(() => {
  cleanup();
});

describe("two-layer hero: each layer walks its own chain", () => {
  it("thumb error → thumb fallback; full error → full fallback", () => {
    render(<NftPieceDetail piece={piece()} />);
    fireEvent.error(imgBySrc(THUMB)!);
    fireEvent.error(imgBySrc(FULL)!);
    expect(imgBySrc(THUMB_FB)).not.toBeNull();
    expect(imgBySrc(FULL_FB)).not.toBeNull();
  });

  it("a fully failed full image leaves the thumb visible", () => {
    render(<NftPieceDetail piece={piece()} />);
    fireEvent.error(imgBySrc(FULL)!);
    fireEvent.error(imgBySrc(FULL_FB)!);
    expect(imgBySrc(THUMB)).not.toBeNull();
    expect(screen.queryByText("No artwork")).toBeNull();
  });
});

describe("the piece name is announced once", () => {
  function exhaustThumb() {
    fireEvent.error(imgBySrc(THUMB)!);
    fireEvent.error(imgBySrc(THUMB_FB)!);
  }

  it("thumb exhausted, full still loading: the placeholder names the piece", () => {
    render(<NftPieceDetail piece={piece()} />);
    exhaustThumb();
    expect(screen.getByText("No artwork")).not.toBeNull();
    expect(screen.getAllByRole("img", { name: "Piece 7" })).toHaveLength(2);
    // ↑ the placeholder (role=img) + the still-transparent full <img>.
    //   The pre-fix behaviour stays like this after load, too — see below.
  });

  it("thumb exhausted, THEN the full image loads: placeholder is aria-hidden", () => {
    render(<NftPieceDetail piece={piece()} />);
    exhaustThumb();
    fireEvent.load(imgBySrc(FULL)!);

    const placeholder = screen.getByText("No artwork").parentElement!;
    expect(placeholder.getAttribute("aria-hidden")).toBe("true");
    expect(placeholder.hasAttribute("role")).toBe(false);
    expect(screen.getAllByRole("img", { name: "Piece 7" })).toHaveLength(1);
  });

  it("control: a single-URL hero keeps an announced placeholder when it fails", () => {
    render(
      <NftPieceDetail
        piece={piece({ image_url: null, image_fallback_url: null, image_url_thumb_fallback_url: null })}
      />,
    );
    fireEvent.error(imgBySrc(THUMB)!);
    expect(screen.getByRole("img", { name: "Piece 7" }).textContent).toContain("No artwork");
  });
});
