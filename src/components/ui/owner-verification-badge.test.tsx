/**
 * PR C — the public owner-verification badge.
 *
 * Pinned:
 *   - the server's `label` renders VERBATIM (never "Verified", never text
 *     derived from `kind`), and opening it shows `label` + `description`;
 *   - a missing, null or blank label renders no badge at all (fail closed);
 *   - nothing date-like reaches the DOM even when the wire carries one;
 *   - both search hosts keep today's VerifiedBadge when the field is absent
 *     and show the server label instead when it is present.
 *
 * Real components and a real QueryClient; only the search endpoint module
 * (plus router/session) is a stand-in.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectSearchResult, SearchSuggestion } from "@/lib/api/types";

const hoisted = vi.hoisted(() => ({
  getSearchSuggestions: vi.fn(),
  getTrendingSearches: vi.fn(async () => ({ results: [], categories: [] })),
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
vi.mock("@/lib/api/cards-search-endpoints", () => ({
  getSearchSuggestions: (...a: unknown[]) => hoisted.getSearchSuggestions(...(a as [])),
  getTrendingSearches: (...a: unknown[]) => hoisted.getTrendingSearches(...(a as [])),
}));

import { GlobalSearch } from "@/components/search/GlobalSearch";
import { ProjectRow } from "@/components/search/SearchResultsTab";
import {
  ClaimVerificationMark,
  OwnerVerificationBadge,
} from "@/components/ui/OwnerVerificationBadge";

afterEach(cleanup);
beforeEach(() => {
  hoisted.getSearchSuggestions.mockReset();
});

const NODE_KEY = {
  kind: "node_key",
  label: "Node Key Verified",
  description: "Cryptographic proof",
};
const STAFF = { kind: "staff", label: "Verified by BCC", description: "Staff verification" };

/** Anything that looks like a date or a time of day. */
const DATE_LIKE = /\b20\d\d\b|\b\d{1,2}:\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

describe("OwnerVerificationBadge (page header)", () => {
  it("renders the server label verbatim and opens to label + description", () => {
    const { container } = render(<OwnerVerificationBadge verification={NODE_KEY} />);
    const badge = screen.getByTestId("owner-verification");
    const summary = within(badge).getByText("Node Key Verified", { selector: "summary" });
    expect(summary).toBeInTheDocument();
    expect(badge).not.toHaveAttribute("open");

    fireEvent.click(summary);
    expect(badge).toHaveAttribute("open");
    // The panel repeats the label and adds the description, both verbatim.
    expect(within(badge).getAllByText("Node Key Verified")).toHaveLength(2);
    expect(within(badge).getByText("Cryptographic proof")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bVerified Operator\b/);
  });

  it("never renders text derived from kind", () => {
    // A server label the kind would never produce: only the label may show.
    const { container } = render(
      <OwnerVerificationBadge
        verification={{ kind: "wallet", label: "Proof on file", description: "Signed by the operator" }}
      />,
    );
    expect(container.textContent).toContain("Proof on file");
    expect(container.textContent).not.toMatch(/wallet/i);
    expect(container.textContent).not.toMatch(/node key|staff/i);
  });

  it("renders no date even when the wire carries verified_at and method", () => {
    const { container } = render(
      <OwnerVerificationBadge
        verification={{ ...STAFF, method: "staff", verified_at: "2026-11-01T09:15:00Z" }}
      />,
    );
    fireEvent.click(screen.getByText("Verified by BCC", { selector: "summary" }));
    expect(container.textContent).not.toMatch(DATE_LIKE);
    expect(container.textContent).not.toContain("2026-11-01");
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["a blank label", { kind: "wallet", label: "   ", description: "Cryptographic proof" }],
    ["an empty label", { kind: "wallet", label: "", description: "Cryptographic proof" }],
    ["no label key", { kind: "wallet", description: "Cryptographic proof" }],
    ["a non-string label", { kind: "wallet", label: 7, description: "Cryptographic proof" }],
  ])("renders nothing for %s", (_name, value) => {
    const { container } = render(<OwnerVerificationBadge verification={value} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ClaimVerificationMark (search rows)", () => {
  it("falls back to today's VerifiedBadge when the field is absent", () => {
    render(<ClaimVerificationMark isClaimVerified ownerVerification={undefined} />);
    expect(screen.getByTitle("Verified Operator")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-verification-chip")).toBeNull();
  });

  it("falls back to today's VerifiedBadge when the label is blank", () => {
    render(<ClaimVerificationMark isClaimVerified ownerVerification={{ ...STAFF, label: " " }} />);
    expect(screen.getByTitle("Verified Operator")).toBeInTheDocument();
  });

  it("renders nothing for an unverified row without the field", () => {
    const { container } = render(<ClaimVerificationMark isClaimVerified={false} ownerVerification={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the server label, statically, when present", () => {
    render(<ClaimVerificationMark isClaimVerified ownerVerification={STAFF} />);
    const chip = screen.getByTestId("owner-verification-chip");
    expect(chip).toHaveTextContent("Verified by BCC");
    expect(chip).toHaveAttribute("title", "Staff verification");
    // No nested control: the search row is itself a link or an option.
    expect(within(chip).queryByRole("button")).toBeNull();
    expect(chip.querySelector("details, summary, a")).toBeNull();
    expect(screen.queryByTitle("Verified Operator")).toBeNull();
  });
});

const PROJECT_ROW: ProjectSearchResult = {
  page_id: 40,
  page_name: "Anvil Validator",
  page_url: "/v/anvil",
  avatar_url: "",
  trust_score: 60,
  tier: null,
  endorsements: 0,
  verified: true,
  is_claim_verified: true,
  followers: 3,
  category: "Validator",
  category_slug: "validator",
};

describe("SearchResultsTab ProjectRow", () => {
  it("keeps VerifiedBadge exactly as today when owner_verification is absent", () => {
    render(<ProjectRow row={PROJECT_ROW} />);
    expect(screen.getByTitle("Verified Operator")).toBeInTheDocument();
    expect(screen.queryByTestId("owner-verification-chip")).toBeNull();
  });

  it("shows the server label instead when the row carries one", () => {
    render(<ProjectRow row={{ ...PROJECT_ROW, owner_verification: NODE_KEY as never }} />);
    expect(screen.getByTestId("owner-verification-chip")).toHaveTextContent("Node Key Verified");
    expect(screen.queryByTitle("Verified Operator")).toBeNull();
  });
});

const SUGGESTION: SearchSuggestion = {
  id: 40,
  name: "Anvil Validator",
  handle: "anvil",
  card_kind: "validator",
  reputation_tier: "trusted",
  reputation_tier_label: "Trusted",
  trust_score: 60,
  is_verified: true,
  is_claim_verified: true,
  href: "/v/anvil",
};

async function showSuggestions(items: SearchSuggestion[]) {
  hoisted.getSearchSuggestions.mockResolvedValue({ items });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("combobox", { name: "Search BCC" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "anvil" } });
  await waitFor(() => {
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(items.length);
  });
  return document.querySelector('[role="option"]') as HTMLElement;
}

describe("GlobalSearch SuggestionRow", () => {
  it("keeps VerifiedBadge exactly as today when owner_verification is absent", async () => {
    const row = await showSuggestions([SUGGESTION]);
    expect(within(row).getByTitle("Verified Operator")).toBeInTheDocument();
    expect(within(row).queryByTestId("owner-verification-chip")).toBeNull();
  });

  it("shows the server label instead when the row carries one", async () => {
    const row = await showSuggestions([{ ...SUGGESTION, owner_verification: STAFF as never }]);
    expect(within(row).getByTestId("owner-verification-chip")).toHaveTextContent("Verified by BCC");
    expect(within(row).queryByTitle("Verified Operator")).toBeNull();
  });
});
