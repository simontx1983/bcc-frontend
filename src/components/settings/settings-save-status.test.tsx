/**
 * SettingsSaveStatus — one answer to "did that save?", and one announcement.
 *
 * The subtle requirement is the announcement model. Progress and success go
 * through a polite region; a failure uses the alert pattern instead, and the
 * polite region must fall silent so the same outcome is not announced twice
 * by two competing live regions.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SettingsSaveStatus,
  saveStatusFrom,
} from "@/components/settings/SettingsSaveStatus";

afterEach(cleanup);

/** The text a sighted user sees (the aria-hidden span, or the alert). */
function visibleText(): string {
  const el =
    document.querySelector("[aria-hidden='true']") ??
    document.querySelector('[role="alert"]');
  return el?.textContent ?? "";
}

/** The text a screen reader hears from the polite region. */
function announcedText(): string {
  return (
    document.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? ""
  );
}

describe("visible wording", () => {
  it("renders nothing readable when idle", () => {
    render(<SettingsSaveStatus status="idle" />);
    expect(screen.queryByText("Saving…")).toBeNull();
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.queryByText(/couldn.t save/i)).toBeNull();
  });

  it("shows Saving… while pending", () => {
    render(<SettingsSaveStatus status="saving" />);
    expect(visibleText()).toBe("Saving…");
  });

  it("shows Saved after success", () => {
    render(<SettingsSaveStatus status="saved" />);
    expect(visibleText()).toBe("Saved");
  });

  it("shows Couldn't save after failure, and never Saved", () => {
    render(<SettingsSaveStatus status="error" />);
    expect(screen.getByText(/couldn.t save/i)).toBeInTheDocument();
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("appends a server reason when there is one", () => {
    render(<SettingsSaveStatus status="error" errorMessage="Wrong password." />);
    expect(screen.getByText(/wrong password\./i)).toBeInTheDocument();
  });
});

describe("announcement model", () => {
  it("announces progress and success politely", () => {
    const { rerender } = render(<SettingsSaveStatus status="saving" />);
    const polite = document.querySelector('[role="status"][aria-live="polite"]');
    expect(polite?.textContent).toBe("Saving…");

    rerender(<SettingsSaveStatus status="saved" />);
    expect(
      document.querySelector('[role="status"][aria-live="polite"]')?.textContent,
    ).toBe("Saved");
  });

  it("uses the alert pattern for a failure", () => {
    render(<SettingsSaveStatus status="error" />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t save/i);
  });

  it("does not announce a failure twice", () => {
    // The polite region must be empty during an error, or a screen reader
    // hears the same outcome from both regions.
    render(<SettingsSaveStatus status="error" />);
    const polite = document.querySelector('[role="status"][aria-live="polite"]');
    expect(polite?.textContent).toBe("");
  });

  it("keeps visible and announced wording identical", () => {
    render(<SettingsSaveStatus status="saving" />);
    expect(announcedText()).toBe(visibleText());
  });
});

describe("timing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("clears Saved after a few seconds", () => {
    render(<SettingsSaveStatus status="saved" />);
    expect(visibleText()).toBe("Saved");

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(visibleText()).toBe("");
    expect(announcedText()).toBe("");
  });

  it("keeps a failure on screen indefinitely", () => {
    // A failure the user never got to read is a failure they cannot act on.
    render(<SettingsSaveStatus status="error" />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText(/couldn.t save/i)).toBeInTheDocument();
  });
});

describe("layout stability", () => {
  it("reserves space so states cannot shift surrounding controls", () => {
    const { container, rerender } = render(<SettingsSaveStatus status="idle" />);
    const slot = container.firstElementChild as HTMLElement;
    const cls = slot.className;

    expect(cls).toMatch(/min-h-\[\d+px\]/);
    expect(cls).toMatch(/min-w-\[\d+px\]/);

    rerender(<SettingsSaveStatus status="error" errorMessage="x" />);
    expect((container.firstElementChild as HTMLElement).className).toBe(cls);
  });
});

describe("saveStatusFrom", () => {
  const base = { isPending: false, isError: false, isSuccess: false };

  it("maps a mutation onto the four statuses", () => {
    expect(saveStatusFrom(base)).toBe("idle");
    expect(saveStatusFrom({ ...base, isPending: true })).toBe("saving");
    expect(saveStatusFrom({ ...base, isError: true })).toBe("error");
    expect(saveStatusFrom({ ...base, isSuccess: true })).toBe("saved");
  });

  it("prefers pending over a previous result during a retry", () => {
    // error → saving → saved must read as progress, not a stale failure.
    expect(saveStatusFrom({ isPending: true, isError: true, isSuccess: false })).toBe(
      "saving",
    );
  });
});
