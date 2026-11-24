/**
 * Dialog hands focus back to its trigger on close, even when a child
 * focuses itself on mount (F-494).
 *
 * Children's mount effects run before the Dialog's own, so the Dialog
 * used to record the child's self-focused element (the New Post dialog's
 * composer textarea) as "what had focus before". On close it focused that
 * unmounted element, and focus fell to <body>.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

import { Dialog } from "@/components/ui/Dialog";

afterEach(cleanup);

function SelfFocusingField() {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return <textarea ref={ref} aria-label="draft" />;
}

function Host({ autofocusChild }: { autofocusChild: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      {open && (
        <Dialog title="Test dialog" onClose={() => setOpen(false)}>
          {autofocusChild ? <SelfFocusingField /> : <textarea aria-label="draft" />}
          <button type="button" onClick={() => setOpen(false)}>
            done
          </button>
        </Dialog>
      )}
    </>
  );
}

function openFromTrigger() {
  const trigger = screen.getByRole("button", { name: "open" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("Dialog — focus returns to the trigger", () => {
  it("when a child focuses itself on mount", () => {
    render(<Host autofocusChild />);
    const trigger = openFromTrigger();
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toContainElement(document.activeElement as HTMLElement);

    fireEvent.click(screen.getByRole("button", { name: "done" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("on Escape, too", () => {
    render(<Host autofocusChild />);
    const trigger = openFromTrigger();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("control: a child that doesn't focus itself", () => {
    render(<Host autofocusChild={false} />);
    const trigger = openFromTrigger();

    fireEvent.click(screen.getByRole("button", { name: "done" }));

    expect(document.activeElement).toBe(trigger);
  });
});
