/**
 * ConfirmDialog — the shared body for destructive, non-undoable actions.
 *
 * Its whole job is to sit between an irreversible click and the request, so
 * the properties worth pinning are the ones that would let a click through
 * anyway: a confirm firing twice, a dismissal landing mid-flight, or a
 * failure closing the dialog and stranding the user with no retry.
 *
 * Focus trap, focus return, scroll lock and Escape all come from the shared
 * `Dialog` and are its tests' business, not repeated here.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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

afterEach(cleanup);

interface Overrides {
  pending?: boolean;
  errorMessage?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
}

function renderDialog(o: Overrides = {}) {
  const onConfirm = o.onConfirm ?? vi.fn();
  const onCancel = o.onCancel ?? vi.fn();
  render(
    <ConfirmDialog
      title="Remove your avatar?"
      body="Your profile will show your initial instead."
      confirmLabel="Remove photo"
      cancelLabel="Keep photo"
      retryLabel="Try again"
      errorMessage={o.errorMessage ?? null}
      pending={o.pending ?? false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe("the decision", () => {
  it("states what will happen, in the caller's words", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Your profile will show your initial instead.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Keep photo" })).toBeDefined();
  });

  it("confirming calls back exactly once per click", () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancelling does not confirm", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Keep photo" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("while the request is in flight", () => {
  it("refuses a second confirm", () => {
    // `disabled` alone loses a race with a double-click inside one frame,
    // because the attribute only lands on the next render.
    const { onConfirm } = renderDialog({ pending: true });
    const btn = screen.getByRole("button", { name: "Working…" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("refuses to close, because a sent request cannot be recalled", () => {
    const { onCancel } = renderDialog({ pending: true });
    fireEvent.click(screen.getByRole("button", { name: "Keep photo" }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("says it is working", () => {
    renderDialog({ pending: true });
    expect(screen.getByRole("button", { name: "Working…" })).toBeDefined();
  });
});

describe("after a failure", () => {
  it("stays open, announces the reason, and offers a retry", () => {
    renderDialog({ errorMessage: "Couldn't remove it. Your image hasn't changed." });
    expect(screen.getByRole("dialog")).toBeDefined();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Couldn't remove it. Your image hasn't changed.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
  });

  it("the retry is live", () => {
    const { onConfirm } = renderDialog({ errorMessage: "nope" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("can still be dismissed once the request has settled", () => {
    const { onCancel } = renderDialog({ errorMessage: "nope", pending: false });
    fireEvent.click(screen.getByRole("button", { name: "Keep photo" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows no alert when nothing has failed", () => {
    renderDialog();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats an empty error string as no error", () => {
    renderDialog({ errorMessage: "" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeDefined();
  });
});
