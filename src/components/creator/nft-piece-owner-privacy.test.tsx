/**
 * NftPieceDetail owner block — no wallet→member line.
 *
 * `owner.is_linked` used to render "Held by a BCC member" / "Held by an
 * unlinked wallet". Holder wallets are public on-chain, so that line told
 * any visitor whether a given wallet belongs to a member. The server sends
 * `is_linked: null` from contract v1.NEXT; an older server still sends a
 * boolean, and that must not be rendered either, so this ships safely in
 * either order. Only the aggregate holder summary remains.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

import { NftPieceDetail } from "@/components/creator/NftPieceDetail";
import type { NftPiece } from "@/lib/api/types";

function piece(overrides: Partial<NftPiece> = {}): NftPiece {
  return {
    id: "ethereum:0xabc:7",
    collection: {
      id: 1,
      name: "Demo",
      creator_handle: null,
      chain_slug: "ethereum",
      contract_address: "0xabc",
      token_standard: "ERC-1155",
      is_verified: false,
    },
    token_id: "7",
    name: "Piece 7",
    description: null,
    image_url: null,
    image_fallback_url: null,
    image_url_thumb: null,
    image_url_thumb_fallback_url: null,
    attributes: [],
    owner: { is_linked: null },
    owners_count: 3,
    owners: [],
    marketplace_links: [],
    mint_link: null,
    permissions: {},
    meta: {
      read_time: false,
      indexer_state: {},
      indexer_state_label: {},
      owners_summary_label: "Held by 3 collectors",
    },
    ...overrides,
  };
}

const MEMBER_LINES = /Held by a BCC member|Held by an unlinked wallet/;

afterEach(() => {
  cleanup();
});

describe("owner block never says whether the holder is a member", () => {
  it.each([
    ["null (v1.NEXT server)", null],
    ["true (older server)", true],
    ["false (older server)", false],
  ] as const)("is_linked %s → no member line, summary kept", (_label, isLinked) => {
    render(
      <NftPieceDetail piece={piece({ owner: { is_linked: isLinked } })} routeCreatorSlug="demo" />,
    );

    expect(screen.queryByText(MEMBER_LINES)).toBeNull();
    expect(screen.getByText("Held by 3 collectors")).toBeTruthy();
  });

  it("renders no empty owner panel when there is no holder summary", () => {
    render(
      <NftPieceDetail
        piece={piece({ meta: { read_time: false, indexer_state: {}, indexer_state_label: {}, owners_summary_label: null } })}
        routeCreatorSlug="demo"
      />,
    );

    expect(screen.queryByText("Owner")).toBeNull();
    expect(screen.queryByText(MEMBER_LINES)).toBeNull();
  });
});
