/**
 * F-317 L-gr1 — the group page's tab strip (GroupTabs), for keyboard and
 * screen-reader users.
 *
 *   - No arrow keys and every tab its own tab stop. Now the APG tabs model
 *     via the shared useRovingTabs: Arrow / Home / End move focus, Enter /
 *     Space activate (manual activation: in urlBase mode activating pushes
 *     a route), and the strip is ONE tab stop.
 *   - Every tab carried aria-controls, but only the active panel is
 *     rendered, so the inactive ones pointed at ids that did not exist.
 *   - The tabpanel was aria-live="polite" around the whole Stream feed, so
 *     every load and count change in it was read out.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { GroupTabs } from "@/components/groups/GroupTabs";

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
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
    configurable: true,
  });
});

beforeEach(() => push.mockReset());
afterEach(cleanup);

function Hall({ urlBase }: { urlBase?: string }) {
  return (
    <GroupTabs
      streamPanel={<p>stream</p>}
      aboutPanel={<p>about</p>}
      membersPanel={<p>members</p>}
      collectionsPanel={<p>collections</p>}
      validatorsPanel={<p>validators</p>}
      {...(urlBase !== undefined ? { urlBase } : {})}
    />
  );
}

const tabs = () => screen.getAllByRole("tab");
const tab = (name: string) => screen.getByRole("tab", { name });

describe("keyboard: the APG tabs model", () => {
  it("the strip is one tab stop: the selected tab", () => {
    render(<Hall />);
    const stops = tabs().filter((t) => t.tabIndex === 0);
    expect(stops).toEqual([tab("Stream")]);
    for (const t of tabs().filter((t) => t !== tab("Stream"))) expect(t.tabIndex).toBe(-1);
  });

  it("Arrow keys move focus and wrap, without changing the selection", () => {
    render(<Hall />);
    tab("Stream").focus();

    fireEvent.keyDown(tab("Stream"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("About"));
    expect(tab("Stream")).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tab("About"), { key: "ArrowLeft" });
    fireEvent.keyDown(tab("Stream"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab("Validators"));
    expect(screen.getByText("stream")).toBeInTheDocument();
  });

  it("Home and End go to the ends", () => {
    render(<Hall />);
    tab("Stream").focus();
    fireEvent.keyDown(tab("Stream"), { key: "End" });
    expect(document.activeElement).toBe(tab("Validators"));
    fireEvent.keyDown(tab("Validators"), { key: "Home" });
    expect(document.activeElement).toBe(tab("Stream"));
  });

  it("Enter and Space activate the focused tab", () => {
    render(<Hall />);
    tab("Stream").focus();
    fireEvent.keyDown(tab("Stream"), { key: "ArrowRight" });
    fireEvent.keyDown(tab("About"), { key: "Enter" });
    expect(tab("About")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("about")).toBeInTheDocument();
    expect(tab("About").tabIndex).toBe(0);

    fireEvent.keyDown(tab("About"), { key: "ArrowRight" });
    fireEvent.keyDown(tab("Members"), { key: " " });
    expect(tab("Members")).toHaveAttribute("aria-selected", "true");
  });

  it("in route mode, arrowing never navigates; only activating does", () => {
    render(<Hall urlBase="/communities/welders" />);
    tab("Stream").focus();
    fireEvent.keyDown(tab("Stream"), { key: "ArrowRight" });
    fireEvent.keyDown(tab("About"), { key: "ArrowRight" });
    expect(push).not.toHaveBeenCalled();

    fireEvent.keyDown(tab("Members"), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/communities/welders/members");
  });
});

describe("panel association", () => {
  it("only the selected tab names a panel, and that panel exists", () => {
    render(<Hall />);
    for (const t of tabs()) {
      const controls = t.getAttribute("aria-controls");
      if (t.getAttribute("aria-selected") === "true") {
        expect(controls).not.toBeNull();
        expect(document.getElementById(controls!), "aria-controls points at nothing").not.toBeNull();
      } else {
        expect(controls, `${t.textContent} points at an unrendered panel`).toBeNull();
      }
    }
  });

  it("the panel is not a live region (it wraps the whole feed)", () => {
    render(<Hall />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).not.toHaveAttribute("aria-live");
    expect(panel).toHaveAttribute("aria-labelledby", tab("Stream").id);
  });
});
