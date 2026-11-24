/**
 * F-264: closing the share sheet is not a request to copy.
 *
 * ShareButton fell through to the clipboard on ANY rejection from
 * navigator.share, so cancelling the sheet copied the link and showed
 * "Link copied". Now a cancel (AbortError) does nothing; any other failure
 * still falls back to copying.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ShareButton } = await import("@/components/feed/ShareButton");

const writeText = vi.fn<(text: string) => Promise<void>>();
let share: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  share = vi.fn();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
});

async function press() {
  fireEvent.click(screen.getByRole("button", { name: "Share post" }));
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe("ShareButton", () => {
  it("a cancelled share sheet copies nothing and says nothing", async () => {
    share.mockRejectedValue(new DOMException("Share canceled", "AbortError"));
    render(<ShareButton selfHref="/p/1" />);
    await press();
    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText("Link copied")).toBeNull();
    expect(screen.getByRole("button", { name: "Share post" })).toHaveAttribute("title", "Share");
  });

  it("any other share failure still falls back to copying the link", async () => {
    share.mockRejectedValue(new DOMException("Not allowed", "NotAllowedError"));
    render(<ShareButton selfHref="/p/1" />);
    await press();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/1`);
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  });

  it("a completed share copies nothing either", async () => {
    share.mockResolvedValue(undefined);
    render(<ShareButton selfHref="/p/1" shareTitle="A post" />);
    await press();
    expect(share).toHaveBeenCalledWith({ url: `${window.location.origin}/p/1`, title: "A post" });
    expect(writeText).not.toHaveBeenCalled();
  });
});
