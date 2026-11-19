/**
 * useSearchTerm — the shared debounce + 2-character floor behind every
 * search hook (F-260 M9). Pure React state, so fake timers are safe here.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEARCH_MIN_LENGTH, useSearchTerm } from "@/hooks/useSearchTerm";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(initial: string) {
  return renderHook(({ raw }) => useSearchTerm(raw), {
    initialProps: { raw: initial },
  });
}

describe("useSearchTerm", () => {
  it("the floor is two characters", () => {
    expect(SEARCH_MIN_LENGTH).toBe(2);
  });

  it("starts from the term in hand, trimmed, with no debounce wait", () => {
    const { result } = mount("  cosmos ");
    expect(result.current).toBe("cosmos");
  });

  it("starts empty for a term under the floor", () => {
    expect(mount("a").result.current).toBe("");
    expect(mount("   ").result.current).toBe("");
  });

  it("a change waits for typing to settle", () => {
    const { result, rerender } = mount("");
    rerender({ raw: "co" });
    act(() => vi.advanceTimersByTime(199));
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("co");
  });

  it("only the last of a burst of keystrokes lands", () => {
    const { result, rerender } = mount("");
    rerender({ raw: "co" });
    act(() => vi.advanceTimersByTime(150));
    rerender({ raw: "cos" });
    act(() => vi.advanceTimersByTime(150));
    rerender({ raw: "cosm" });
    act(() => vi.advanceTimersByTime(199));
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("cosm");
  });

  it("dropping under the floor clears at once", () => {
    const { result, rerender } = mount("cosmos");
    rerender({ raw: "c" });
    expect(result.current).toBe("");
  });
});
