/**
 * F-514: one bottom-centre slot for the five floating surfaces, so they
 * stack instead of painting over each other, and sit outside every
 * stacking context in the page (portaled to document.body).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useState } from "react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { BOTTOM_SLOT_HOST_ID, BottomSlot } from "@/components/ui/BottomSlot";

afterEach(() => cleanup());

const host = () => document.getElementById(BOTTOM_SLOT_HOST_ID);

describe("BottomSlot", () => {
  it("portals into one fixed host on document.body, outside the component's own tree", () => {
    const { container } = render(
      <div style={{ position: "relative", zIndex: 2 }}>
        <BottomSlot>
          <p>first notice</p>
        </BottomSlot>
      </div>,
    );
    const h = host() as HTMLElement;
    expect(h.parentElement).toBe(document.body);
    expect(container.contains(screen.getByText("first notice"))).toBe(false);
    expect(h.contains(screen.getByText("first notice"))).toBe(true);
    // Above the mobile bar, bottom centre on desktop, a column that takes
    // no clicks itself.
    expect(h).toHaveClass(
      "fixed",
      "inset-x-4",
      "bottom-[calc(var(--bcc-mobile-nav-total-h)+16px)]",
      "md:bottom-6",
      "z-40",
      "flex",
      "flex-col",
      "items-center",
      "gap-2",
      "pointer-events-none",
    );
  });

  it("several surfaces share the one host and stack in the order they appeared", () => {
    render(
      <>
        <BottomSlot>
          <p>consent banner</p>
        </BottomSlot>
        <BottomSlot>
          <p>posted notice</p>
        </BottomSlot>
      </>,
    );
    expect(document.querySelectorAll(`#${BOTTOM_SLOT_HOST_ID}`)).toHaveLength(1);
    const texts = Array.from((host() as HTMLElement).children).map((n) => n.textContent);
    expect(texts).toEqual(["consent banner", "posted notice"]);
  });

  it("the host goes when the last surface does, and not before", () => {
    function Two() {
      const [a, setA] = useState(true);
      const [b, setB] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setA(false)}>drop a</button>
          <button type="button" onClick={() => setB(false)}>drop b</button>
          {a && <BottomSlot><p>a</p></BottomSlot>}
          {b && <BottomSlot><p>b</p></BottomSlot>}
        </>
      );
    }
    render(<Two />);
    expect(host()).not.toBeNull();
    act(() => screen.getByRole("button", { name: "drop a" }).click());
    expect(host()).not.toBeNull();
    expect(screen.getByText("b")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "drop b" }).click());
    expect(host()).toBeNull();
  });

  it("renders nothing on the server, so hydration never meets a portal", () => {
    expect(renderToString(<BottomSlot><p>notice</p></BottomSlot>)).toBe("");
  });
});
