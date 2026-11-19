/**
 * F-264 (UX Lows) — the profile's Block button.
 *
 * - Its name was only "BLOCK" / "UNBLOCK": out of context (a screen
 *   reader's list of buttons) it did not say whom it acts on. It now
 *   carries the handle.
 * - It also had aria-pressed on top of the swapping label, so a blocked
 *   profile read "UNBLOCK, toggle button, pressed". The label alone says
 *   it now.
 * - While a request ran it was `disabled`, which blurs the button the
 *   viewer just pressed. It is now aria-disabled + aria-busy, and a second
 *   press is ignored.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemberProfile } from "@/lib/api/types";

const h = vi.hoisted(() => ({
  block: { mutate: vi.fn(), isPending: false },
  unblock: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/hooks/useBlocks", () => ({
  useBlockUser: () => h.block,
  useUnblockUser: () => h.unblock,
}));

const { BlockToggle } = await import("@/components/profile/BlockToggle");

function profile(viewerBlocking: boolean): MemberProfile {
  return {
    user_id: 42,
    handle: "jo-welds",
    viewer_blocking: viewerBlocking,
    permissions: { can_block: { allowed: true } },
  } as unknown as MemberProfile;
}

beforeEach(() => {
  h.block = { mutate: vi.fn(), isPending: false };
  h.unblock = { mutate: vi.fn(), isPending: false };
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

  it("blocking still asks first and sends the user id", () => {
    render(<BlockToggle profile={profile(false)} />);
    fireEvent.click(screen.getByRole("button", { name: "Block @jo-welds" }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(h.block.mutate).toHaveBeenCalledWith(42);
  });
});

describe("BlockToggle — while a request runs", () => {
  it("keeps its place and focus: aria-disabled + aria-busy, never disabled", () => {
    const view = render(<BlockToggle profile={profile(false)} />);
    const button = screen.getByRole("button", { name: "Block @jo-welds" });
    button.focus();
    fireEvent.click(button);
    expect(h.block.mutate).toHaveBeenCalledTimes(1);

    h.block = { ...h.block, isPending: true };
    view.rerender(<BlockToggle profile={profile(false)} />);
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
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("is an ordinary button again once idle", () => {
    render(<BlockToggle profile={profile(true)} />);
    const button = screen.getByRole("button", { name: "Unblock @jo-welds" });
    expect(button).toHaveAttribute("aria-busy", "false");
    expect(button).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(button);
    expect(h.unblock.mutate).toHaveBeenCalledWith(42);
  });
});
