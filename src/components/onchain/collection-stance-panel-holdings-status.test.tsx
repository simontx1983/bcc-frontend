/**
 * The stance panel must not present incomplete evidence as "you own nothing".
 *
 * ── THE DEFECT THIS PINS SHUT ───────────────────────────────────────────
 * The panel response used to be `{ items }` alone. When the backend could
 * not read a member's holdings it sent `items: []`, and this component
 * rendered that as a verdict: "No collections detected in your linked
 * wallets yet." A provider outage was shown to the user as a fact about
 * their wallet.
 *
 * The backend now sends `holdings_status`, and ONLY `complete` licenses an
 * empty list to be read as an answer.
 *
 * ── WHY THE FIELD IS OPTIONAL HERE ──────────────────────────────────────
 * It is absent when an older backend is still deployed. That must keep the
 * legacy wording rather than crash or mislabel, so either deployment order
 * is safe — which is the whole point of shipping the two repositories
 * independently.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import contract from "@/lib/api/__contracts__/collection-stance-panel.contract.json";
import type {
  CollectionHoldingsStatus,
  CollectionStancePanelItem,
  CollectionStancePanelResponse,
} from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const panelState: {
  data: CollectionStancePanelResponse | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
} = { data: undefined, isPending: false, isError: false, error: null };

vi.mock("@/hooks/useCollectionStances", () => ({
  COLLECTION_STANCE_PANEL_QUERY_KEY: ["bcc", "me", "collection-stances", "panel"],
  useCollectionStancePanel: () => panelState,
  useSetCollectionStance: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearCollectionStance: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CollectionStancePanel } from "@/components/onchain/CollectionStancePanel";

const ROW: CollectionStancePanelItem = {
  chain_id: 8,
  chain_slug: "cosmos",
  contract_address: "cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzz",
  name: "Atlas",
  image_url: null,
  collection_verified: false,
  state: "waitlist",
  group_id: null,
  waitlist_count: 1,
  viewer_stance: null,
};

function show(
  items: CollectionStancePanelItem[],
  holdingsStatus?: CollectionHoldingsStatus,
): void {
  panelState.data =
    holdingsStatus === undefined
      ? { items }
      : { items, holdings_status: holdingsStatus };

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <CollectionStancePanel />
    </QueryClientProvider>,
  );
}

const DENIAL = /no collections detected in your linked wallets yet/i;

afterEach(() => {
  cleanup();
  panelState.data = undefined;
});

describe("stance panel — holdings_status", () => {
  // ── complete ────────────────────────────────────────────────────────

  it("complete WITH items renders the collections", () => {
    show([ROW], "complete");

    expect(screen.getByText("Atlas")).toBeTruthy();
    expect(screen.queryByText(DENIAL)).toBeNull();
    expect(screen.queryByText(/could not be fully checked/i)).toBeNull();
  });

  it("complete WITHOUT items states the verified-collection wording", () => {
    show([], "complete");

    expect(
      screen.getByText(/no verified collections were detected in your linked wallets/i),
    ).toBeTruthy();
  });

  // ── partial ─────────────────────────────────────────────────────────

  it("partial WITH items shows the rows AND a notice", () => {
    show([ROW], "partial");

    expect(screen.getByText("Atlas")).toBeTruthy();
    expect(screen.getByText(/some linked wallets could not be fully checked/i)).toBeTruthy();
    expect(screen.queryByText(DENIAL)).toBeNull();
  });

  it("partial WITHOUT items never reads as a denial", () => {
    show([], "partial");

    expect(
      screen.getByText(/couldn.t finish checking all of your linked wallets/i),
    ).toBeTruthy();
    expect(screen.queryByText(DENIAL)).toBeNull();
  });

  // ── unavailable ─────────────────────────────────────────────────────

  it("unavailable never reads as a denial", () => {
    show([], "unavailable");

    expect(
      screen.getByText(/collection holdings are temporarily unavailable/i),
    ).toBeTruthy();
    expect(screen.queryByText(DENIAL)).toBeNull();
  });

  // ── the field is absent (older backend, mid-deploy) ──────────────────

  it("absent keeps the legacy wording and does not crash", () => {
    show([]);

    expect(screen.getByText(DENIAL)).toBeTruthy();
  });

  it("absent WITH items still renders them", () => {
    show([ROW]);

    expect(screen.getByText("Atlas")).toBeTruthy();
    expect(screen.queryByText(/could not be fully checked/i)).toBeNull();
  });

  // ── nothing leaks into the copy ─────────────────────────────────────

  it("no status token, provider name or wallet address appears in the rendered copy", () => {
    show([], "unavailable");

    const text = document.body.textContent ?? "";
    for (const forbidden of [
      "unavailable_",
      "holdings_status",
      "stargaze",
      "marketplace",
      "cosmos1",
      "0x",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// The shared contract fixture — drift in either repository fails CI.
// ─────────────────────────────────────────────────────────────────────

describe("stance panel — shared contract fixture", () => {
  const vocabulary = contract.response.holdings_status.vocabulary as string[];

  it("the TypeScript union matches the fixture vocabulary", () => {
    // Every member of the union, written out: if someone widens or narrows
    // `CollectionHoldingsStatus`, this array stops compiling or stops
    // matching, and the fixture is the thing that decides which.
    const union: CollectionHoldingsStatus[] = ["complete", "partial", "unavailable"];

    expect(union).toEqual(vocabulary);
    expect(vocabulary).toEqual(["complete", "partial", "unavailable"]);
  });

  it("the fixture pins the items shape this component reads", () => {
    const fields = contract.response.items.fields as string[];

    for (const key of Object.keys(ROW)) {
      expect(fields).toContain(key);
    }
    expect(fields.length).toBe(Object.keys(ROW).length);
  });

  it("null is not a member of the vocabulary", () => {
    expect(contract.response.holdings_status.nullable).toBe(false);
    expect(vocabulary).not.toContain(null);
  });
});
