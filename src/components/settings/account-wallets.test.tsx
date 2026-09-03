/**
 * Wallets section: honest read failures, a real Copy, a real confirmation.
 *
 * Three defects this pins shut:
 *
 *   1. A failed wallet load rendered a bare sentence telling the user to
 *      "Refresh and try again" — which would have discarded every other
 *      unsaved form on the Account tab. The query is an ordinary
 *      useQuery, so a real in-place retry was always available.
 *   2. A failure must never fall through to "No wallets linked yet",
 *      which would claim the account has none.
 *   3. Unlink confirmed by swapping the row's own button for CANCEL /
 *      CONFIRM UNLINK. That unmounted the trigger (dropping focus to
 *      <body>), trapped nothing, ignored Escape, and guarded double
 *      submits only with `isPending`, which lags a render.
 *
 * Plus the new Copy affordance: the address stays visually truncated, so
 * the clipboard must receive the WHOLE thing.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Keep the wallet-linking machinery and the collection panel out of it —
// this file is about reads, copy and unlink.
vi.mock("@/lib/wallet/linkFlow", () => ({
  runLinkFlow: vi.fn(),
  humanizeLinkError: () => "Wallet unavailable.",
}));
vi.mock("@/components/onchain/CollectionStancePanel", () => ({
  CollectionStancePanel: () => null,
}));

const walletsState = {
  data: undefined as unknown,
  isLoading: false,
  isError: false,
};
const walletsRefetch = vi.fn();
const unlinkMutate = vi.fn();
const unlinkState = { isPending: false };
// `| undefined` explicitly: exactOptionalPropertyTypes forbids assigning
// a possibly-undefined callback into a plain optional property.
const unlinkHandlers: {
  onSuccess?: (() => void) | undefined;
  onError?: ((e: unknown) => void) | undefined;
} = {};

vi.mock("@/hooks/useWallets", () => ({
  MY_WALLETS_QUERY_KEY: ["bcc", "me", "wallets"],
  useMyWallets: () => ({ ...walletsState, refetch: walletsRefetch }),
  useUnlinkWallet: (o: { onSuccess?: () => void; onError?: (e: unknown) => void } = {}) => {
    unlinkHandlers.onSuccess = o.onSuccess;
    unlinkHandlers.onError = o.onError;
    return { mutate: unlinkMutate, isPending: unlinkState.isPending, variables: undefined };
  },
}));
vi.mock("@/hooks/useRecoveryEmail", () => ({
  useRequestRecoveryEmail: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
  useVerifyRecoveryEmail: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
}));

import { WalletsSection } from "@/components/settings/WalletsSection";
import { BccApiError } from "@/lib/api/types";

const FULL_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const SECOND_ADDRESS = "0xfedcba0987654321fedcba0987654321fedcba09";

function walletsPayload() {
  return {
    items: [
      {
        id: 11,
        chain_slug: "base",
        chain_name: "Base",
        wallet_address: FULL_ADDRESS,
        verified: true,
        is_primary: true,
        created_at: "2026-08-01 10:00:00",
        explorer_url: "",
      },
      {
        id: 22,
        chain_slug: "ethereum",
        chain_name: "Ethereum",
        wallet_address: SECOND_ADDRESS,
        verified: true,
        is_primary: false,
        created_at: "2026-08-02 10:00:00",
        explorer_url: "",
      },
    ],
    recovery: { has_recovery_email: true, verified_wallet_count: 2 },
  };
}

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WalletsSection />
    </QueryClientProvider>,
  );
}

let clipboardText: string | null = null;
let clipboardShouldFail = false;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {}, writable: true, configurable: true,
  });
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: (t: string) => {
        if (clipboardShouldFail) return Promise.reject(new Error("denied"));
        clipboardText = t;
        return Promise.resolve();
      },
    },
    configurable: true,
  });
});

beforeEach(() => {
  walletsState.data = walletsPayload();
  walletsState.isLoading = false;
  walletsState.isError = false;
  walletsRefetch.mockReset();
  unlinkMutate.mockReset();
  unlinkState.isPending = false;
  clipboardText = null;
  clipboardShouldFail = false;
  // execCommand fallback inside useCopyConfirm.
  (document as unknown as { execCommand: () => boolean }).execCommand = () => !clipboardShouldFail;
});
afterEach(cleanup);

const EMPTY_COPY = /No wallets linked yet/i;

/** Polite regions with something in them — an empty one announces nothing. */
const populatedStatuses = () =>
  [...document.querySelectorAll('[role="status"]')].filter(
    (n) => (n.textContent ?? "").trim() !== "",
  );

// ─────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────

describe("wallet reads", () => {
  it("a failed load renders LoadFailure, never the empty state", () => {
    walletsState.isError = true;
    walletsState.data = undefined;
    renderSection();
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
    expect(screen.getByText("We couldn't load your wallets.")).toBeDefined();
    // The old dead end told the user to reload the page.
    expect(document.body.textContent).not.toMatch(/Refresh and try again/i);
  });

  it("the failure's Try again re-runs the query in place", () => {
    walletsState.isError = true;
    walletsState.data = undefined;
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(walletsRefetch).toHaveBeenCalledTimes(1);
  });

  it("a CONFIRMED empty response may show the empty state", () => {
    walletsState.data = { items: [], recovery: { has_recovery_email: true, verified_wallet_count: 0 } };
    renderSection();
    expect(screen.getByText(EMPTY_COPY)).toBeDefined();
  });

  it("keeps known wallets visible when a background refetch fails", () => {
    walletsState.isError = true; // data still present
    renderSection();
    expect(screen.getByRole("button", { name: "Copy Base wallet address" })).toBeDefined();
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(walletsRefetch).toHaveBeenCalledTimes(1);
  });

  it("renders no second wallets heading of its own", () => {
    const { container } = renderSection();
    expect(container.textContent).not.toContain("IDENTITY · WALLETS");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Copy
// ─────────────────────────────────────────────────────────────────────

describe("copy address", () => {
  it("copies the FULL address even though the display is truncated", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Copy Base wallet address" }));
    await waitFor(() => expect(clipboardText).toBe(FULL_ADDRESS));
    expect(clipboardText).not.toMatch(/…/);
  });

  it("names the chain so multiple rows are distinguishable", () => {
    renderSection();
    expect(screen.getByRole("button", { name: "Copy Base wallet address" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy Ethereum wallet address" })).toBeDefined();
  });

  it("announces success politely, once, naming the row", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Copy Base wallet address" }));
    await waitFor(() => expect(screen.getByText("Base address copied")).toBeDefined());
    expect(populatedStatuses()).toHaveLength(1);
  });

  it("a clipboard failure shows our wording, not the browser exception", async () => {
    clipboardShouldFail = true;
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Copy Base wallet address" }));
    await waitFor(() =>
      expect(screen.getByText("Couldn't copy the Base address.")).toBeDefined(),
    );
    expect(document.body.textContent).not.toContain("denied");
  });

  it("the announcement never contains the address itself", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Copy Base wallet address" }));
    await waitFor(() => expect(screen.getByText("Base address copied")).toBeDefined());
    const spoken = populatedStatuses().map((n) => n.textContent ?? "").join(" ");
    expect(spoken).not.toContain(FULL_ADDRESS);
    expect(spoken).not.toContain(FULL_ADDRESS.slice(0, 10));
  });

  // ── the defect the section-level rewrite exists to prevent ──────────
  //
  // Per-row state gave each row its own polite region and its own 1400ms
  // timer. Copying A and then B inside that window left BOTH regions
  // populated, so a screen reader announced the stale one too. One piece
  // of state means the previous outcome is STRUCTURALLY replaced.

  it("copying a SECOND wallet leaves exactly one populated region", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Copy Base wallet address" }));
    await waitFor(() => expect(screen.getByText("Base address copied")).toBeDefined());

    // Well inside the 1400ms confirm window — the old bug's exact timing.
    fireEvent.click(screen.getByRole("button", { name: "Copy Ethereum wallet address" }));
    await waitFor(() => expect(clipboardText).toBe(SECOND_ADDRESS));

    await waitFor(() => expect(screen.getByText("Ethereum address copied")).toBeDefined());
    expect(screen.queryByText("Base address copied")).toBeNull();
    expect(populatedStatuses()).toHaveLength(1);
  });

  it("a FAILED second copy replaces a successful first announcement", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Copy Base wallet address" }));
    await waitFor(() => expect(screen.getByText("Base address copied")).toBeDefined());

    clipboardShouldFail = true;
    fireEvent.click(screen.getByRole("button", { name: "Copy Ethereum wallet address" }));
    await waitFor(() =>
      expect(screen.getByText("Couldn't copy the Ethereum address.")).toBeDefined(),
    );
    expect(screen.queryByText("Base address copied")).toBeNull();
    expect(populatedStatuses()).toHaveLength(1);
  });

  it("the region empties when the confirm window lapses", async () => {
    vi.useFakeTimers();
    try {
      renderSection();
      const btn = screen.getByRole("button", { name: "Copy Base wallet address" });
      await act(async () => {
        fireEvent.click(btn);
      });
      expect(screen.getByText("Base address copied")).toBeDefined();
      // useCopyConfirm holds the flag for 1400ms.
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(populatedStatuses()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a FAILURE announcement is not cleared by the success timer", async () => {
    // `copied` never goes true on failure, so the clearing effect must not
    // treat the lapsed timer as a reason to wipe an error the user has not
    // read yet.
    vi.useFakeTimers();
    try {
      clipboardShouldFail = true;
      renderSection();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Copy Base wallet address" }));
      });
      expect(screen.getByText("Couldn't copy the Base address.")).toBeDefined();
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText("Couldn't copy the Base address.")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keyboard activation announces exactly as a click does", async () => {
    renderSection();
    const btn = screen.getByRole("button", { name: "Copy Ethereum wallet address" });
    btn.focus();
    expect(document.activeElement).toBe(btn);
    // A <button> turns Enter/Space into a click; fire the click the browser
    // would synthesise rather than asserting on the key event itself.
    fireEvent.keyDown(btn, { key: "Enter" });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText("Ethereum address copied")).toBeDefined());
    expect(populatedStatuses()).toHaveLength(1);
  });

  it("unmounting mid-window logs no state-after-unmount warning", async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => {
      errors.push(a);
    });
    try {
      const view = renderSection();
      fireEvent.click(screen.getByRole("button", { name: "Copy Base wallet address" }));
      await waitFor(() => expect(screen.getByText("Base address copied")).toBeDefined());
      view.unmount();
      // Past the 1400ms confirm timer with the tree gone.
      await new Promise((r) => setTimeout(r, 1600));
      expect(errors, `console.error during unmount: ${JSON.stringify(errors)}`).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("copy buttons mint no duplicate ids across rows", () => {
    renderSection();
    const ids = [...document.querySelectorAll("[id]")].map((n) => n.id);
    expect(new Set(ids).size, `duplicate id in ${ids.join(", ")}`).toBe(ids.length);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Unlink
// ─────────────────────────────────────────────────────────────────────

describe("unlink", () => {
  const unlinkButtons = () => screen.getAllByRole("button", { name: "Unlink" });

  it("requires confirmation and starts no mutation on its own", () => {
    renderSection();
    fireEvent.click(unlinkButtons()[0] as HTMLElement);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(unlinkMutate).not.toHaveBeenCalled();
  });

  it("unlinks the wallet whose row was activated, not the first one", () => {
    renderSection();
    fireEvent.click(unlinkButtons()[1] as HTMLElement); // Ethereum, id 22
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Ethereum");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlink wallet" }));
    expect(unlinkMutate).toHaveBeenCalledWith(22);
  });

  it("does not read the full address out in the confirmation", () => {
    renderSection();
    fireEvent.click(unlinkButtons()[0] as HTMLElement);
    expect(screen.getByRole("dialog").textContent).not.toContain(FULL_ADDRESS);
  });

  it("cannot double-fire from a double click", () => {
    renderSection();
    fireEvent.click(unlinkButtons()[0] as HTMLElement);
    const confirm = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Unlink wallet",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(unlinkMutate).toHaveBeenCalledTimes(1);
  });

  it("Cancel restores focus to that exact row's Unlink button", () => {
    renderSection();
    const second = unlinkButtons()[1] as HTMLElement;
    fireEvent.click(second);
    fireEvent.click(screen.getByRole("button", { name: "Keep wallet" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(second);
  });

  it("Escape closes and restores focus", () => {
    renderSection();
    const first = unlinkButtons()[0] as HTMLElement;
    fireEvent.click(first);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(first);
  });

  it("a failure keeps the dialog open, recoverable, with no raw server text", () => {
    renderSection();
    fireEvent.click(unlinkButtons()[0] as HTMLElement);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Unlink wallet" }),
    );
    act(() => {
      unlinkHandlers.onError?.(
        new BccApiError("bcc_last_recovery_method", "RAW UNLINK SERVER TEXT", 409, null),
      );
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/only verified wallet/i);
    expect(document.body.textContent).not.toContain("RAW UNLINK SERVER TEXT");
    expect(within(dialog).getByRole("button", { name: /try again/i })).toBeDefined();
  });
});
