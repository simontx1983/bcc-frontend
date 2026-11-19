/**
 * F-421 (a): Backing → Given never claims "no vouches" on a failed read.
 *
 * GET /users/:handle/endorsements used to answer 200 with an empty list
 * when the server could not read the vouches, and the tab printed
 * "Hasn't vouched for any pages yet". The trust half now answers 503
 * bcc_unavailable; with nothing to show, the tab renders the read failure
 * with a Retry. Any other failure gets the generic copy, never the empty
 * claim. A genuinely empty list still reads as empty, and rows already
 * held survive a failed refresh.
 *
 * Real hook and a real QueryClient against a stubbed endpoint. The hook's
 * own retry policy (one retry) applies, hence the longer waits.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type UserEndorsementItem, type UserEndorsementsResponse } from "@/lib/api/types";

const fx = vi.hoisted(() => ({ getUserEndorsements: vi.fn() }));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/lib/api/user-activity-endpoints", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getUserEndorsements: (...args: unknown[]) => fx.getUserEndorsements(...args),
}));

import {
  ENDORSEMENTS_LOAD_FAILED_COPY,
  ENDORSEMENTS_UNAVAILABLE_COPY,
  EndorsementsGivenView,
} from "@/components/profile/EndorsementsGivenView";

const EMPTY_CLAIM = /Hasn.t vouched for any pages yet/;
const WAIT = { timeout: 4000 };

const row: UserEndorsementItem = {
  id: 1,
  page_id: 40,
  page_title: "Blacksmith Node",
  page_url: "/v/blacksmith-node",
  avatar_url: "",
  trust_score: null,
  tier: "trusted",
  weight: 1,
  context: "general",
  reason: null,
  created_at: "2026-11-01 10:00:00",
};
const response = (items: UserEndorsementItem[]): UserEndorsementsResponse => ({ items, total: items.length });
const unavailable = () => new BccApiError("bcc_unavailable", "raw server prose", 503, null);

function renderView() {
  const client = new QueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <EndorsementsGivenView handle="alice" />
    </QueryClientProvider>,
  );
  return { client, view };
}

// Block body: a hook that RETURNS a function has it run as teardown, and
// mockReset() returns the mock, which would then be called after the test.
beforeEach(() => {
  fx.getUserEndorsements.mockReset();
});
afterEach(cleanup);

describe("EndorsementsGivenView — a failed read is not an empty list (F-421)", () => {
  it("503 bcc_unavailable: the read failure with a Retry, never the empty claim", async () => {
    fx.getUserEndorsements.mockRejectedValue(unavailable());
    renderView();

    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent(ENDORSEMENTS_UNAVAILABLE_COPY);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_CLAIM)).toBeNull();
    expect(screen.queryByText(/raw server prose/)).toBeNull();
  });

  it("Retry asks again, and the rows replace the failure", async () => {
    fx.getUserEndorsements.mockRejectedValue(unavailable());
    renderView();
    await screen.findByRole("alert", {}, WAIT);

    fx.getUserEndorsements.mockReset();
    fx.getUserEndorsements.mockResolvedValue(response([row]));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });

    expect(await screen.findByText("Blacksmith Node", {}, WAIT)).toBeInTheDocument();
    expect(fx.getUserEndorsements).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("any other failure: the generic copy, still never the empty claim", async () => {
    fx.getUserEndorsements.mockRejectedValue(new BccApiError("bcc_internal_error", "x", 500, null));
    renderView();

    expect(await screen.findByRole("alert", {}, WAIT)).toHaveTextContent(ENDORSEMENTS_LOAD_FAILED_COPY);
    expect(screen.queryByText(EMPTY_CLAIM)).toBeNull();
  });

  it("control: a successful empty read still says so", async () => {
    fx.getUserEndorsements.mockResolvedValue(response([]));
    renderView();

    expect(await screen.findByText(EMPTY_CLAIM)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rows already shown stay through a failed refresh", async () => {
    fx.getUserEndorsements.mockResolvedValueOnce(response([row]));
    const { client } = renderView();
    await screen.findByText("Blacksmith Node");

    fx.getUserEndorsements.mockRejectedValue(unavailable());
    await act(async () => {
      await client.refetchQueries();
    });
    // The refresh (and its one retry) has failed by now; the rows stay.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1500));
    });

    expect(screen.getByText("Blacksmith Node")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(EMPTY_CLAIM)).toBeNull();
  }, 10_000);
});
