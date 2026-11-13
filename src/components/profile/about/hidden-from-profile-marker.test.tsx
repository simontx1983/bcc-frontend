/**
 * HIDDEN FROM YOUR PROFILE — shown to the owner only when one of the
 * card's prefs is explicitly false. Absent means shown; loading and
 * errors render nothing rather than a guess.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));

const getProfilePrefs = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/profile-prefs-endpoints", () => ({
  getProfilePrefs: () => getProfilePrefs(),
  patchProfilePrefs: vi.fn(),
}));

const { HiddenFromProfileMarker } = await import("./HiddenFromProfileMarker");

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  getProfilePrefs.mockReset();
});

function renderMarker(keys: Parameters<typeof HiddenFromProfileMarker>[0]["prefKeys"]) {
  return render(
    <QueryClientProvider client={client}>
      <div data-testid="host">
        <HiddenFromProfileMarker prefKeys={keys} />
      </div>
    </QueryClientProvider>,
  );
}

describe("HiddenFromProfileMarker", () => {
  it("renders when the pref is false", async () => {
    getProfilePrefs.mockResolvedValue({ show_blogs_on_profile: false });
    const { container } = renderMarker(["show_blogs_on_profile"]);
    const marker = await within(container).findByTestId("hidden-from-profile");
    expect(marker.textContent).toBe("Hidden from your profile");
  });

  it("renders when ANY of a card's prefs is false", async () => {
    getProfilePrefs.mockResolvedValue({ show_operator_on_profile: false });
    const { container } = renderMarker(["show_groups_on_profile", "show_operator_on_profile"]);
    expect(await within(container).findByTestId("hidden-from-profile")).toBeInTheDocument();
  });

  it("absent or true → nothing", async () => {
    getProfilePrefs.mockResolvedValue({ show_about_on_profile: true });
    const { container } = renderMarker(["show_about_on_profile", "show_blogs_on_profile"]);
    await waitFor(() => expect(getProfilePrefs).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(within(container).queryByTestId("hidden-from-profile")).toBeNull();
  });
});
