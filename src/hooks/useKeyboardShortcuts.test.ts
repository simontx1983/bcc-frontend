/**
 * A keydown with no `key` (Chrome's form autofill dispatches these, as do
 * some IME / extension-synthesised events) used to throw an uncaught
 * "Cannot read properties of undefined (reading 'toLowerCase')" from the
 * letter-shortcut matcher — seen in production on /communities/new. Such
 * an event must match no key-based shortcut and never throw; `code:`
 * shortcuts still match on `event.code`.
 */

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

/** A keydown whose `key` is undefined, as autofill dispatches it. */
function keylessKeydown(code?: string): Event {
  const ev = new Event("keydown", { bubbles: true, cancelable: true });
  if (code !== undefined) Object.defineProperty(ev, "code", { value: code });
  return ev;
}

const errors: unknown[] = [];
const onError = (e: ErrorEvent) => {
  errors.push(e.error);
  e.preventDefault();
};

afterEach(() => {
  window.removeEventListener("error", onError);
  errors.length = 0;
});

describe("useKeyboardShortcuts — a keydown without a key", () => {
  it("does not throw and fires no letter or symbol shortcut", () => {
    window.addEventListener("error", onError);
    const letter = vi.fn();
    const symbol = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: "h", run: letter },
        { key: "?", run: symbol },
      ]),
    );

    expect(() => window.dispatchEvent(keylessKeydown())).not.toThrow();
    expect(errors).toEqual([]);
    expect(letter).not.toHaveBeenCalled();
    expect(symbol).not.toHaveBeenCalled();
  });

  it("control: a real 'h' keydown still fires the letter shortcut", () => {
    const letter = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "h", run: letter }]));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
    expect(letter).toHaveBeenCalledTimes(1);
  });

  it("a code: shortcut still matches on event.code even without a key", () => {
    const byCode = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: "code:KeyK", run: byCode }]));
    window.dispatchEvent(keylessKeydown("KeyK"));
    expect(byCode).toHaveBeenCalledTimes(1);
  });
});
