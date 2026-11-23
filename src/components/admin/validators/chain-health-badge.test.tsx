/**
 * ChainHealthBadge — shows the server's audit-log verdict, never its own.
 *
 * Real component, real hook, real QueryClient; only the endpoint module
 * is mocked.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const getHealth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/admin-validator-endpoints", () => ({
  getAdminValidatorDirectory: vi.fn(),
  getValidatorRelationshipHistory: vi.fn(),
  getValidatorRelationshipHealth: (...a: unknown[]) => getHealth(...a),
}));

import { ChainHealthBadge } from "@/components/admin/validators/ChainHealthBadge";

beforeEach(() => {
  getHealth.mockReset();
});

afterEach(cleanup);

function renderBadge() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ChainHealthBadge />
    </QueryClientProvider>,
  );
}

const HEALTH = { checked_at: "2026-11-23T09:30:00Z", rows_checked: 42, head_seq: 42 };

describe("ChainHealthBadge", () => {
  it("chain_ok true → 'Audit log verified', with checked_at and rows_checked", async () => {
    getHealth.mockResolvedValue({ ...HEALTH, chain_ok: true });
    renderBadge();

    const badge = await screen.findByText("AUDIT LOG VERIFIED");
    const region = badge.closest('[role="status"]') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent("42 rows");
    expect(region.querySelector("time")).toHaveAttribute("datetime", "2026-11-23T09:30:00Z");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/check failed/i)).toBeNull();
  });

  it("chain_ok false → a warning alert, never the verified label", async () => {
    getHealth.mockResolvedValue({ ...HEALTH, chain_ok: false, rows_checked: 1 });
    renderBadge();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("AUDIT LOG CHECK FAILED");
    expect(alert).toHaveTextContent(/report it to engineering/i);
    expect(alert).toHaveTextContent("1 row");
    expect(alert.querySelector("time")).toHaveAttribute("datetime", "2026-11-23T09:30:00Z");
    expect(screen.queryByText("AUDIT LOG VERIFIED")).toBeNull();
  });

  it("an admin denial renders nothing — the history list owns that panel", async () => {
    getHealth.mockRejectedValue(new BccApiError("bcc_forbidden", "x", 403, null));
    const { container } = renderBadge();
    await vi.waitFor(() => expect(getHealth).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });

  it("a route the server doesn't have yet says so in one line", async () => {
    getHealth.mockRejectedValue(new BccApiError("rest_no_route", "x", 404, null));
    renderBadge();
    expect(
      await screen.findByText("The audit log check isn't available on the server yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("AUDIT LOG VERIFIED")).toBeNull();
  });
});
