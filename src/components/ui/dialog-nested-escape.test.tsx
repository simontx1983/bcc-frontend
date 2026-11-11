/**
 * Dialogs listen for keys on `window`. A dialog opened inside another
 * (a delete confirm inside the photo Lightbox) must take Escape alone:
 * one Escape closes only the topmost dialog, never the one underneath,
 * so the inner dialog can't be unmounted mid-request.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

import { Dialog } from "@/components/ui/Dialog";

afterEach(cleanup);

describe("Dialog — nested Escape", () => {
  it("Escape closes only the topmost dialog", () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    const { rerender } = render(
      <Dialog title="Outer" onClose={outerClose}>
        <p>outer</p>
        <Dialog title="Inner" onClose={innerClose}>
          <p>inner</p>
        </Dialog>
      </Dialog>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();

    // Once the inner one is gone, Escape reaches the outer one again.
    rerender(
      <Dialog title="Outer" onClose={outerClose}>
        <p>outer</p>
      </Dialog>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(outerClose).toHaveBeenCalledTimes(1);
  });

  it("control: a single dialog still closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Only" onClose={onClose}>
        <p>x</p>
      </Dialog>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
