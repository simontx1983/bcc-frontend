/**
 * Settings → Blocks: where keyboard focus goes while an Unblock runs and
 * after it lands (review Low on #340).
 *
 * - In flight, the pressed button is busy through aria-disabled + aria-busy,
 *   NOT `disabled`. A focused control that turns disabled is blurred by the
 *   browser, so its "Working… unblocking {name}" name would never be read.
 *   The same pattern as FeedView's Load more (#335). A press while busy
 *   sends nothing.
 * - On success the row leaves on the re-read and takes its button with it.
 *   Focus moves to the next row's Unblock, or to the section heading when
 *   it was the last row (the heading survives the empty state). Focus is
 *   never pulled from somewhere the user moved to in the meantime.
 * - On failure focus stays on the button, which names the error.
 *
 * Real hooks, a real QueryClient and the real settings panel (for the
 * heading), against stubbed endpoints.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type MyBlockEntry, type MyBlocksResponse } from "@/lib/api/types";

const fx = vi.hoisted(() => ({
  getMyBlocks: vi.fn(),
  unblockUser: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/lib/api/blocks-endpoints", () => ({
  getMyBlocks: fx.getMyBlocks,
  unblockUser: fx.unblockUser,
  blockUser: vi.fn(),
}));

import { BlocksSettingsPanel } from "@/components/profile/panels/settings/BlocksSettingsPanel";

function member(user_id: number, handle: string, display_name: string): MyBlockEntry {
  return { user_id, handle, display_name, avatar_url: "", profile_url: `/u/${handle}` };
}
const anvil = member(11, "anvil", "Anvil Smith");
const rivet = member(12, "rivet", "Rivet Jones");
const weld = member(13, "weld", "Weld Cole");

const page = (items: MyBlockEntry[]): MyBlocksResponse => ({
  items,
  pagination: { page: 1, per_page: 20, total: items.length, total_pages: 1 },
});

function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BlocksSettingsPanel />
    </QueryClientProvider>,
  );
}

const unblockButton = (name: string) => screen.getByRole("button", { name: `Unblock ${name}` });
const heading = () => screen.getByRole("heading", { name: "Blocked users" });

/** Focus the button (as a keyboard user would) and press it. */
async function press(button: HTMLElement) {
  button.focus();
  await act(async () => {
    fireEvent.click(button);
  });
}

beforeEach(() => {
  fx.getMyBlocks.mockReset();
  fx.unblockUser.mockReset();
});
afterEach(cleanup);

describe("BlocksList — busy, not disabled", () => {
  it("the pressed button keeps focus, and its name says it is working", async () => {
    fx.getMyBlocks.mockResolvedValue(page([anvil, rivet]));
    fx.unblockUser.mockReturnValue(new Promise(() => undefined));
    renderPanel();

    const button = await screen.findByRole("button", { name: "Unblock Anvil Smith" });
    await press(button);

    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(document.activeElement).toBe(button);
    expect(button).toHaveAccessibleName("Working… unblocking Anvil Smith");
  });

  it("a second press while in flight sends nothing", async () => {
    fx.getMyBlocks.mockResolvedValue(page([anvil, rivet]));
    fx.unblockUser.mockReturnValue(new Promise(() => undefined));
    renderPanel();

    const button = await screen.findByRole("button", { name: "Unblock Anvil Smith" });
    await press(button);
    await waitFor(() => expect(fx.unblockUser).toHaveBeenCalledTimes(1));
    await press(button);
    await press(button);
    // Let any request a repeat press might have started reach the endpoint.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(fx.unblockUser).toHaveBeenCalledTimes(1);
  });
});

describe("BlocksList — focus after a successful unblock", () => {
  it("moves to the next row's Unblock, and stays there once the row has gone", async () => {
    fx.getMyBlocks.mockResolvedValueOnce(page([anvil, rivet, weld])).mockResolvedValue(page([anvil, weld]));
    fx.unblockUser.mockResolvedValue({ ok: true, user_id: rivet.user_id, removed: true });
    renderPanel();

    await press(await screen.findByRole("button", { name: "Unblock Rivet Jones" }));

    await waitFor(() => expect(document.activeElement).toBe(unblockButton("Weld Cole")));
    await waitFor(() => expect(screen.queryByText("Rivet Jones")).toBeNull());
    expect(document.activeElement).toBe(unblockButton("Weld Cole"));
  });

  it("moves to the section heading when the last row was unblocked", async () => {
    fx.getMyBlocks.mockResolvedValueOnce(page([anvil, rivet])).mockResolvedValue(page([anvil]));
    fx.unblockUser.mockResolvedValue({ ok: true, user_id: rivet.user_id, removed: true });
    renderPanel();

    await press(await screen.findByRole("button", { name: "Unblock Rivet Jones" }));

    await waitFor(() => expect(document.activeElement).toBe(heading()));
    await waitFor(() => expect(screen.queryByText("Rivet Jones")).toBeNull());
    expect(document.activeElement).toBe(heading());
  });

  it("moves to the heading, which survives the empty state, when the only row was unblocked", async () => {
    fx.getMyBlocks.mockResolvedValueOnce(page([anvil])).mockResolvedValue(page([]));
    fx.unblockUser.mockResolvedValue({ ok: true, user_id: anvil.user_id, removed: true });
    renderPanel();

    await press(await screen.findByRole("button", { name: "Unblock Anvil Smith" }));

    expect(await screen.findByText("NONE ON FILE")).toBeInTheDocument();
    expect(document.activeElement).toBe(heading());
  });

  it("does not pull focus from where the user moved during the request", async () => {
    fx.getMyBlocks.mockResolvedValueOnce(page([anvil, rivet, weld])).mockResolvedValue(page([rivet, weld]));
    const request = deferred<{ ok: true; user_id: number; removed: boolean }>();
    fx.unblockUser.mockReturnValue(request.promise);
    renderPanel();

    await press(await screen.findByRole("button", { name: "Unblock Anvil Smith" }));
    // The user moves on (to a row that is NOT the next one) before it lands.
    unblockButton("Weld Cole").focus();
    await act(async () => {
      request.resolve({ ok: true, user_id: anvil.user_id, removed: true });
      await request.promise;
    });

    await waitFor(() => expect(screen.queryByText("Anvil Smith")).toBeNull());
    expect(document.activeElement).toBe(unblockButton("Weld Cole"));
  });
});

describe("BlocksList — focus after a failed unblock", () => {
  it("stays on the pressed button, which names the error", async () => {
    fx.getMyBlocks.mockResolvedValue(page([anvil, rivet]));
    fx.unblockUser.mockRejectedValue(new BccApiError("bcc_rate_limited", "raw server prose", 429, null));
    renderPanel();

    const button = await screen.findByRole("button", { name: "Unblock Anvil Smith" });
    await press(button);

    const alert = await screen.findByRole("alert");
    expect(document.activeElement).toBe(button);
    expect(button).toHaveAccessibleName("Unblock Anvil Smith");
    expect(button).toHaveAttribute("aria-describedby", alert.id);
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});
