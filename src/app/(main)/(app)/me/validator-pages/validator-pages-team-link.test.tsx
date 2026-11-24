/**
 * /me/validator-pages (PR B2): each row with a page links to that page's
 * team; a row with no page has no team link. The page's existing
 * behaviour (public link, discrepancy line, error state) is unchanged.
 * The page runs for real against a stubbed `getMeValidatorPages`.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MeValidatorPageRow } from "@/lib/api/me-validator-pages-endpoints";

const getMeValidatorPages = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ value: { bccToken: "t" } as { bccToken: string } | null }));
const REDIRECT = vi.hoisted(() => new Error("NEXT_REDIRECT"));
const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw REDIRECT;
  }),
);

vi.mock("next-auth", () => ({ getServerSession: async () => session.value }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/api/me-validator-pages-endpoints", () => ({ getMeValidatorPages }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("next/navigation", () => ({
  redirect,
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import ValidatorPagesDashboard from "./page";

afterEach(() => {
  cleanup();
  getMeValidatorPages.mockReset();
  redirect.mockClear();
  session.value = { bccToken: "t" };
});

function row(over: Partial<MeValidatorPageRow> = {}): MeValidatorPageRow {
  return {
    claim_role: "operator",
    claim_status: "verified",
    page_id: 40,
    page_slug: "figment",
    chain: { slug: "cosmoshub", name: "Cosmos Hub", type: "cosmos" },
    validator: { id: 7, moniker: "Figment", operator_address: "cosmosvaloper1abc" },
    chain_reported_status: "active",
    ...over,
  };
}

async function renderPage() {
  return render(await ValidatorPagesDashboard());
}

describe("/me/validator-pages — Team link", () => {
  it("each row with a page links to /me/validator-pages/<page_id>/team, beside the public link", async () => {
    getMeValidatorPages.mockResolvedValue({
      items: [row(), row({ page_id: 41, page_slug: "chorus-one", validator: { id: 8, moniker: "Chorus One", operator_address: "cosmosvaloper1def" } })],
      total: 2,
    });
    await renderPage();

    expect(screen.getByRole("link", { name: "Team for Figment" })).toHaveAttribute(
      "href",
      "/me/validator-pages/40/team",
    );
    expect(screen.getByRole("link", { name: "Team for Chorus One" })).toHaveAttribute(
      "href",
      "/me/validator-pages/41/team",
    );
    // Existing behaviour kept.
    expect(screen.getAllByRole("link", { name: "VIEW PUBLIC PAGE" }).map((a) => a.getAttribute("href"))).toEqual([
      "/v/figment",
      "/v/chorus-one",
    ]);
  });

  it("a row with no page has no team link (and keeps its discrepancy line)", async () => {
    getMeValidatorPages.mockResolvedValue({ items: [row({ page_id: null, page_slug: null })], total: 1 });
    await renderPage();
    const item = screen.getByRole("listitem");
    expect(within(item).queryByRole("link", { name: /Team for/ })).toBeNull();
    expect(item.textContent).toContain("NO PUBLIC PAGE YET");
  });

  it("anonymous viewers still go through login", async () => {
    session.value = null;
    await expect(ValidatorPagesDashboard()).rejects.toBe(REDIRECT);
    expect(redirect).toHaveBeenCalledWith("/login?callbackUrl=/me/validator-pages");
  });
});
