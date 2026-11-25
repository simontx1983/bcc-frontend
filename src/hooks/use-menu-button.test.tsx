/**
 * useMenuButton's own contract, for what no current consumer can reach
 * through the DOM: a disabled <button> receives no pointer events, but a
 * future menu with aria-disabled items would, and the pointer must still
 * never make an inert item the active one (it would take the tab stop).
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMenuButton } from "@/hooks/useMenuButton";

describe("useMenuButton hover", () => {
  it("makes an enabled item active, and leaves a disabled one alone", () => {
    const { result } = renderHook(() => useMenuButton({ itemCount: 3, isDisabled: (i) => i === 1 }));
    expect(result.current.activeIndex).toBe(0);
    act(() => result.current.hover(1));
    expect(result.current.activeIndex).toBe(0);
    act(() => result.current.hover(2));
    expect(result.current.activeIndex).toBe(2);
  });
});
