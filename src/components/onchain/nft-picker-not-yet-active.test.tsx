/**
 * An unverified collection is LABELLED in the picker, never dimmed or
 * disabled (bcc-frontend #156).
 *
 * ── WHAT THIS PINS ───────────────────────────────────────────────────────
 * `collection_verified === false` means the item's holder community does
 * not exist yet. The item is still a legitimate showcase pick, so the tile
 * must stay a normal, enabled, clickable control. It used to dim the art
 * (opacity 0.55 + desaturate), which reads as "disabled" for something
 * that is not. The treatment is now a shared NotYetActiveBadge whose
 * visible text carries the whole message, because its `title` tooltip
 * never shows on touch.
 *
 * ── THE THREE STATES ─────────────────────────────────────────────────────
 *   false   → badge + aria-label suffix, art undimmed, still selectable
 *   true    → no badge, no suffix
 *   absent  → treated as verified (older payloads; badging on missing data
 *             would flash the whole grid during deploy skew)
 *
 * The aria-label suffix is kept verbatim — it is the wording the contract
 * (umbrella PR #198) quotes.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NOT_YET_ACTIVE_LABEL,
  NOT_YET_ACTIVE_TOOLTIP,
} from "@/components/onchain/NotYetActiveBadge";
import type { NftPickerItem, NftPickerResponse } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const saveMutateAsync = vi.fn<(identity: unknown) => Promise<unknown>>();
const deleteMutateAsync = vi.fn<(identity: unknown) => Promise<unknown>>();

const pickerState: {
  data: NftPickerResponse | undefined;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
} = { data: undefined, isPending: false, isError: false, isSuccess: true, error: null };

vi.mock("@/hooks/useNftSelections", () => ({
  NFT_PICKER_QUERY_KEY_ROOT: ["onchain", "nft-picker"],
  NFT_SELECTIONS_QUERY_KEY_ROOT: ["onchain", "nft-selections"],
  useNftPicker: () => pickerState,
  useSaveNftSelection: () => ({ mutateAsync: saveMutateAsync, isPending: false }),
  useDeleteNftSelection: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}));

vi.mock("@/lib/api/nft-selections-endpoints", () => ({
  getNftPicker: vi.fn(),
}));

import { NftPickerModal } from "@/components/onchain/NftPickerModal";

const SUFFIX = " (collection's community not yet activated)";

function item(overrides: Partial<NftPickerItem>): NftPickerItem {
  return {
    chain_id: 1,
    contract_address: "0xabc",
    token_id: "7",
    wallet_link_id: 3,
    is_selected: false,
    name: "Hammer",
    collection_name: "Tools",
    image_url: "https://img.example/hammer.png",
    ...overrides,
  };
}

function show(items: NftPickerItem[]): void {
  pickerState.data = {
    items,
    truncated: false,
    wallets_checked: 1,
    wallets_truncated: 0,
    selected_keys: {},
    refreshed_at: {},
    meta: { indexer_state: {}, indexer_state_label: {} },
  };

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <NftPickerModal onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

function onlyTile(): HTMLElement {
  const tiles = screen.getAllByRole("checkbox");
  expect(tiles).toHaveLength(1);
  return tiles[0] as HTMLElement;
}

// Dialog reads usePrefersReducedMotion; jsdom ships no matchMedia.
beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  saveMutateAsync.mockReset().mockResolvedValue({});
  deleteMutateAsync.mockReset().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe("NftPickerModal — collection_verified === false", () => {
  it("shows the Not yet active badge, with the detail in its tooltip", () => {
    show([item({ collection_verified: false })]);

    const badge = within(onlyTile()).getByText(NOT_YET_ACTIVE_LABEL);
    expect(badge).toHaveAttribute("title", NOT_YET_ACTIVE_TOOLTIP);
    // Visible text must stand alone — touch devices never show `title`.
    expect(badge.textContent).toBe("Not yet active");
  });

  it("keeps the aria-label suffix verbatim", () => {
    show([item({ collection_verified: false })]);

    expect(onlyTile()).toHaveAttribute(
      "aria-label",
      `Add Hammer to your showcase${SUFFIX}`,
    );
  });

  it("does not dim the art", () => {
    show([item({ collection_verified: false })]);

    const img = onlyTile().querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.style.opacity).toBe("");
    expect(img?.style.filter).toBe("");
    expect(onlyTile().style.opacity).toBe("1");
  });

  it("does not dim the no-image placeholder either", () => {
    show([item({ collection_verified: false, image_url: null })]);

    const placeholder = within(onlyTile()).getByText("№7").parentElement;
    expect(placeholder?.style.opacity).toBe("");
  });

  it("is still selectable: enabled, and a click saves it", async () => {
    show([item({ collection_verified: false })]);

    const tile = onlyTile();
    expect(tile).toBeEnabled();
    fireEvent.click(tile);

    await vi.waitFor(() => {
      expect(saveMutateAsync).toHaveBeenCalledWith({
        chain_id: 1,
        contract_address: "0xabc",
        token_id: "7",
      });
    });
  });

  it("keeps the badge on a selected tile, alongside ✓ ON FLOOR", () => {
    show([item({ collection_verified: false, is_selected: true })]);

    const tile = onlyTile();
    expect(within(tile).getByText(NOT_YET_ACTIVE_LABEL)).toBeInTheDocument();
    expect(within(tile).getByText("✓ ON FLOOR")).toBeInTheDocument();
    expect(tile).toHaveAttribute(
      "aria-label",
      `Remove Hammer from your showcase${SUFFIX}`,
    );
  });
});

describe("NftPickerModal — verified or unknown", () => {
  it("collection_verified === true: no badge, no suffix", () => {
    show([item({ collection_verified: true })]);

    const tile = onlyTile();
    expect(within(tile).queryByText(NOT_YET_ACTIVE_LABEL)).toBeNull();
    expect(tile).toHaveAttribute("aria-label", "Add Hammer to your showcase");
  });

  it("absent flag reads as verified", () => {
    show([item({})]);

    const tile = onlyTile();
    expect(within(tile).queryByText(NOT_YET_ACTIVE_LABEL)).toBeNull();
    expect(tile).toHaveAttribute("aria-label", "Add Hammer to your showcase");
  });
});
