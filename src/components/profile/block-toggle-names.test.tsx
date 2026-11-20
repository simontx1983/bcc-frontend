/**
 * The profile's Block button.
 *
 * F-264 (UX Lows):
 * - Its name was only "BLOCK" / "UNBLOCK": out of context (a screen
 *   reader's list of buttons) it did not say whom it acts on. It now
 *   carries the handle.
 * - It also had aria-pressed on top of the swapping label, so a blocked
 *   profile read "UNBLOCK, toggle button, pressed". The label alone says
 *   it now.
 * - While a request ran it was `disabled`, which blurs the button the
 *   viewer just pressed. It is now aria-disabled + aria-busy, and a second
 *   press is ignored.
 *
 * F-261 (audit M16): blocking asked with a plain window.confirm that only
 * mentioned Floor posts, and nothing confirmed the block afterwards. It is
 * now the house ConfirmDialog with copy matching the server, a polite
 * "Blocked @x." / "Unblocked @x." line, and a refresh of the server-rendered
 * profile.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type { MemberProfile } from "@/lib/api/types";

type MutateOpts = { onSuccess?: () => void; onError?: (err: unknown) => void };
const h = vi.hoisted(() => ({
  block: { mutate: vi.fn(), isPending: false },
  unblock: { mutate: vi.fn(), isPending: false },
  unblockHookOpts: null as null | { onError?: (err: unknown) => void },
  refresh: vi.fn(),
}));
vi.mock("@/hooks/useBlocks", () => ({
  useBlockUser: () => h.block,
  useUnblockUser: (opts: { onError?: (err: unknown) => void }) => {
    h.unblockHookOpts = opts;
    return h.unblock;
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh, push: vi.fn(), replace: vi.fn() }),
}));

const { BlockToggle, BLOCK_COPY } = await import("@/components/profile/BlockToggle");

function profile(viewerBlocking: boolean): MemberProfile {
  return {
    user_id: 42,
    handle: "jo-welds",
    viewer_blocking: viewerBlocking,
    permissions: { can_block: { allowed: true } },
  } as unknown as MemberProfile;
}

const statusLine = () => screen.getByRole("status");
const dialog = () => screen.getByRole("dialog");

beforeAll(() => {
  // The house Dialog reads matchMedia (bottom sheet on phones).
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  h.block = { mutate: vi.fn(), isPending: false };
  h.unblock = { mutate: vi.fn(), isPending: false };
  h.unblockHookOpts = null;
  h.refresh.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BlockToggle — its name and state", () => {
  it("names whom it blocks", () => {
    render(<BlockToggle profile={profile(false)} />);
    const button = screen.getByRole("button", { name: "Block @jo-welds" });
    // The visible label is unchanged; the name starts with it.
    expect(button).toHaveTextContent(/^BLOCK$/);
  });

  it("names whom it unblocks", () => {
    render(<BlockToggle profile={profile(true)} />);
    expect(screen.getByRole("button", { name: "Unblock @jo-welds" })).toBeInTheDocument();
  });

  it("carries no aria-pressed: the label says the action, either way", () => {
    for (const blocking of [false, true]) {
      const view = render(<BlockToggle profile={profile(blocking)} />);
      expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
      view.unmount();
    }
  });

  it("is a 44px tap target", () => {
    render(<BlockToggle profile={profile(false)} />);
    expect(screen.getByRole("button")).toHaveClass("min-h-[44px]");
  });

  it("is hidden when the viewer can't block", () => {
    const p = { ...profile(false), permissions: { can_block: { allowed: false } } } as unknown as MemberProfile;
    render(<BlockToggle profile={p} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("BlockToggle — blocking asks first, in the house dialog (F-261 M16)", () => {
  it("BLOCK opens a dialog that says what a block does, and sends nothing yet", () => {
    render(<BlockToggle profile={profile(false)} />);
    fireEvent.click(screen.getByRole("button", { name: "Block @jo-welds" }));

    expect(window.confirm).not.toHaveBeenCalled();
    const d = dialog();
    expect(d).toHaveAccessibleName("Block @jo-welds?");
    expect(d).toHaveTextContent(BLOCK_COPY.body);
    // Every claim the server backs: posts both ways, messages, watching both ways.
    expect(BLOCK_COPY.body).toContain("You won't see each other's posts");
    expect(BLOCK_COPY.body).toContain("neither of you can message the other");
    expect(BLOCK_COPY.body).toContain("Any watching between you stops, and unblocking won't bring it back.");
    expect(h.block.mutate).not.toHaveBeenCalled();
  });

  it("Cancel closes the dialog and sends nothing", () => {
    render(<BlockToggle profile={profile(false)} />);
    fireEvent.click(screen.getByRole("button", { name: "Block @jo-welds" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.block.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Block @jo-welds" })).toBeInTheDocument();
  });

  it("Block sends the user id; on success the dialog closes, it says so, and the page refreshes", () => {
    h.block.mutate.mockImplementation((_id: number, o?: MutateOpts) => o?.onSuccess?.());
    render(<BlockToggle profile={profile(false)} />);
    const region = statusLine();
    expect(region).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "Block @jo-welds" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Block" }));

    expect(h.block.mutate).toHaveBeenCalledWith(42, expect.anything());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Unblock @jo-welds" })).toBeInTheDocument();
    // The same region, mounted empty before, now holds the notice (#328).
    expect(statusLine()).toBe(region);
    expect(region).toHaveTextContent("Blocked @jo-welds.");
    expect(region).toHaveClass("sr-only");
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it("a failed block stays in the dialog with its line, and nothing changes", () => {
    h.block.mutate.mockImplementation((_id: number, o?: MutateOpts) =>
      o?.onError?.(new BccApiError("bcc_rate_limited", "RAW SERVER TEXT", 429, null)),
    );
    render(<BlockToggle profile={profile(false)} />);
    fireEvent.click(screen.getByRole("button", { name: "Block @jo-welds" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Block" }));

    expect(dialog()).toHaveTextContent("Slow down — too many block attempts. Wait a minute.");
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    expect(statusLine()).toHaveTextContent("");
    expect(h.refresh).not.toHaveBeenCalled();
  });
});

describe("BlockToggle — unblock and the notice", () => {
  it("unblock is one tap; on success it says so and the page refreshes", () => {
    h.unblock.mutate.mockImplementation((_id: number, o?: MutateOpts) => o?.onSuccess?.());
    render(<BlockToggle profile={profile(true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Unblock @jo-welds" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.unblock.mutate).toHaveBeenCalledWith(42, expect.anything());
    expect(statusLine()).toHaveTextContent("Unblocked @jo-welds.");
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Block @jo-welds" })).toBeInTheDocument();
  });

  it("a failed unblock rolls back and says so inline", () => {
    h.unblock.mutate.mockImplementation(() =>
      h.unblockHookOpts?.onError?.(new BccApiError("bcc_unavailable", "x", 503, null)),
    );
    render(<BlockToggle profile={profile(true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Unblock @jo-welds" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't unblock. Try again.");
    expect(screen.getByRole("button", { name: "Unblock @jo-welds" })).toBeInTheDocument();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("each event is fresh text in the same region, so a repeat is read again", () => {
    h.block.mutate.mockImplementation((_id: number, o?: MutateOpts) => o?.onSuccess?.());
    h.unblock.mutate.mockImplementation((_id: number, o?: MutateOpts) => o?.onSuccess?.());
    render(<BlockToggle profile={profile(false)} />);
    const region = statusLine();

    fireEvent.click(screen.getByRole("button", { name: "Block @jo-welds" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Block" }));
    const first = region.firstElementChild;
    expect(first).toHaveTextContent("Blocked @jo-welds.");

    fireEvent.click(screen.getByRole("button", { name: "Unblock @jo-welds" }));
    fireEvent.click(screen.getByRole("button", { name: "Block @jo-welds" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Block" }));
    expect(region.firstElementChild).toHaveTextContent("Blocked @jo-welds.");
    expect(region.firstElementChild).not.toBe(first);
    expect(region.children).toHaveLength(1);
  });
});

describe("BlockToggle — while a request runs", () => {
  it("keeps its place and focus: aria-disabled + aria-busy, never disabled", () => {
    const view = render(<BlockToggle profile={profile(true)} />);
    const button = screen.getByRole("button", { name: "Unblock @jo-welds" });
    button.focus();
    fireEvent.click(button);
    expect(h.unblock.mutate).toHaveBeenCalledTimes(1);

    h.unblock = { ...h.unblock, isPending: true };
    view.rerender(<BlockToggle profile={profile(true)} />);
    const busy = screen.getByRole("button");
    expect(busy).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(busy).toHaveTextContent("WORKING…");
    expect(busy).toHaveAccessibleName("WORKING…");
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).not.toBeDisabled();
  });

  it("ignores a second press while it runs", () => {
    h.unblock = { mutate: vi.fn(), isPending: true };
    render(<BlockToggle profile={profile(true)} />);
    fireEvent.click(screen.getByRole("button"));
    expect(h.unblock.mutate).not.toHaveBeenCalled();
    expect(h.block.mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is an ordinary button again once idle", () => {
    render(<BlockToggle profile={profile(true)} />);
    const button = screen.getByRole("button", { name: "Unblock @jo-welds" });
    expect(button).toHaveAttribute("aria-busy", "false");
    expect(button).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(button);
    expect(h.unblock.mutate).toHaveBeenCalledWith(42, expect.anything());
  });
});
