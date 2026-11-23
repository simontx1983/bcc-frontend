/**
 * F-561 (testnet audit P2): the dialog opened from WRITE A REVIEW showed an
 * UPDATE / REVIEW switcher, inviting a status post from a review button.
 * A composer opened for a review target is a review dialog: no switcher.
 * Every other modal composer keeps its tabs.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "4242", handle: "alice" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const { Composer } = await import("@/components/composer/Composer");

let qc: QueryClient;

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
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  qc.clear();
});

const tablist = () => screen.queryByRole("tablist", { name: "Composer mode" });

function renderComposer(props: Record<string, unknown>) {
  render(
    <QueryClientProvider client={qc}>
      <Composer variant="modal" onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe("F-561 — the review dialog has no mode switcher", () => {
  it("opened for a review (entity target): no tabs, straight into the review form", () => {
    renderComposer({ defaultMode: "review", reviewTargetId: 35, reviewTargetName: "Fixture Validator" });
    expect(tablist()).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("button", { name: /TRUST/ })).toBeInTheDocument();
  });

  it("opened for a review (member target): no tabs either", () => {
    renderComposer({ defaultMode: "review", reviewTargetUserId: 7, reviewTargetName: "alice" });
    expect(tablist()).toBeNull();
  });

  it("a normal modal composer keeps its tabs", () => {
    renderComposer({ defaultMode: "status" });
    expect(tablist()).not.toBeNull();
  });

  it("a modal composer opened on Update with a review target keeps both tabs", () => {
    renderComposer({ defaultMode: "status", reviewTargetId: 35, reviewTargetName: "Fixture Validator" });
    expect(screen.getByRole("tab", { name: /update/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /review/i })).toBeInTheDocument();
  });
});
