/**
 * Paging must not cost the keyboard user their place.
 *
 * ## The defect this pins
 *
 * Every chip was `disabled` while a page transition was in flight, and at
 * the first/last page boundary. `disabled` removes an element from the tab
 * order and the browser blurs it, so the chip the viewer just activated
 * lost focus mid-interaction. Measured in a browser on three consumers —
 * /notifications, /messages and /watching — activating the next-page
 * control with Enter:
 *
 *   control focusable      : true
 *   focus ring             : 2px solid
 *   Enter advances the page: true
 *   focus afterwards       : <body>        ← the defect
 *
 * The keyboard user then had to tab in from the top of the document to
 * reach the pager again. Both triggers are states reached BY USING the
 * control, which is the worst moment to take focus away from it.
 *
 * ## Why these controls are the right ones
 *
 * "Focus is retained" alone would pass against a version that simply
 * never disables anything — which would let a double-press fire two page
 * changes, and let PREV navigate off page 1. So availability is asserted
 * through `aria-disabled` and through the handler staying inert, and the
 * rapid-activation case asserts the *count* of `onPageChange` calls.
 *
 * A latch that ignored every repeat would also pass a naive duplicate
 * test while breaking genuine paging, so there is a case for stepping two
 * pages in a row once `page` has caught up.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PagerNav } from "@/components/ui/PagerNav";

afterEach(cleanup);

const prev = () => screen.getByRole("button", { name: /PREV/i });
const next = () => screen.getByRole("button", { name: /NEXT/i });

function mount(over: Partial<React.ComponentProps<typeof PagerNav>> = {}) {
  const onPageChange = vi.fn();
  const props = { page: 2, totalPages: 5, onPageChange, ...over };
  const view = render(<PagerNav {...props} />);
  return { ...view, onPageChange, props };
}

describe("no chip is ever the HTML disabled attribute", () => {
  it("stays out of `disabled` while busy, so focus survives", () => {
    mount({ isBusy: true });
    expect(next()).not.toBeDisabled();
    expect(prev()).not.toBeDisabled();
  });

  it("stays out of `disabled` at the boundaries", () => {
    cleanup();
    mount({ page: 1 });
    expect(prev()).not.toBeDisabled();
    cleanup();
    mount({ page: 5, totalPages: 5 });
    expect(next()).not.toBeDisabled();
  });

  it("still tells assistive technology the chip is unavailable", () => {
    mount({ page: 1 });
    expect(prev()).toHaveAttribute("aria-disabled", "true");
    expect(next()).not.toHaveAttribute("aria-disabled");
  });

  it("marks a transition in flight with aria-busy", () => {
    mount({ isBusy: true });
    expect(next()).toHaveAttribute("aria-busy", "true");
  });

  it("does not claim busy when it is not", () => {
    mount();
    expect(next()).not.toHaveAttribute("aria-busy");
  });
});

describe("focus position across activation", () => {
  it("KEEPS focus on NEXT after activating it", () => {
    const { onPageChange } = mount();
    const btn = next();
    btn.focus();
    expect(document.activeElement).toBe(btn);

    fireEvent.click(btn);

    expect(onPageChange).toHaveBeenCalledWith(3);
    // The whole point: the viewer's place is where they left it.
    expect(document.activeElement).toBe(btn);
  });

  it("keeps focus on NEXT even when the transition turns busy", () => {
    const { rerender, props } = mount();
    const btn = next();
    btn.focus();
    fireEvent.click(btn);
    rerender(<PagerNav {...props} isBusy />);
    expect(document.activeElement).toBe(next());
  });

  it("keeps focus on NEXT when activation lands on the LAST page", () => {
    // Previously this disabled NEXT and blew focus to <body>.
    const { rerender, props } = mount({ page: 4, totalPages: 5 });
    const btn = next();
    btn.focus();
    fireEvent.click(btn);
    rerender(<PagerNav {...props} page={5} />);
    expect(document.activeElement).toBe(next());
    expect(next()).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps focus on PREV when activation lands on the FIRST page", () => {
    const { rerender, props } = mount({ page: 2 });
    const btn = prev();
    btn.focus();
    fireEvent.click(btn);
    rerender(<PagerNav {...props} page={1} />);
    expect(document.activeElement).toBe(prev());
    expect(prev()).toHaveAttribute("aria-disabled", "true");
  });

  it("is reachable by keyboard and operable with Enter", () => {
    const { onPageChange } = mount();
    const btn = next();
    btn.focus();
    // A focusable <button> activates on Enter natively; jsdom does not
    // synthesise that, so the click Enter produces is what is asserted.
    fireEvent.keyDown(btn, { key: "Enter" });
    fireEvent.click(btn);
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(btn);
  });
});

describe("unavailable chips are inert, not merely dimmed", () => {
  it("PREV on page 1 navigates nowhere", () => {
    const { onPageChange } = mount({ page: 1 });
    fireEvent.click(prev());
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("NEXT on the last page navigates nowhere", () => {
    const { onPageChange } = mount({ page: 5, totalPages: 5 });
    fireEvent.click(next());
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("NEXT respects a server hasNext over the page arithmetic", () => {
    const { onPageChange } = mount({ page: 1, totalPages: 9, hasNext: false });
    fireEvent.click(next());
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("nothing navigates while busy", () => {
    const { onPageChange } = mount({ isBusy: true });
    fireEvent.click(next());
    fireEvent.click(prev());
    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe("rapid activation does not submit twice", () => {
  it("three fast presses of NEXT request one page change", () => {
    // `isBusy` cannot cover this alone: it is driven by a query's
    // `isFetching`, which turns true only after the caller's state change
    // propagates, leaving a window where a second press is accepted.
    const { onPageChange } = mount();
    const btn = next();
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("a genuine SECOND step still works once the page catches up", () => {
    // The control that stops the latch from breaking ordinary paging.
    const { rerender, onPageChange, props } = mount({ page: 2 });
    fireEvent.click(next());
    expect(onPageChange).toHaveBeenCalledWith(3);

    rerender(<PagerNav {...props} page={3} />);
    fireEvent.click(next());

    expect(onPageChange).toHaveBeenCalledTimes(2);
    expect(onPageChange).toHaveBeenLastCalledWith(4);
  });

  it("PREV after a latched NEXT is a different request and goes through", () => {
    const { onPageChange } = mount({ page: 3 });
    fireEvent.click(next());
    fireEvent.click(prev());
    expect(onPageChange).toHaveBeenCalledTimes(2);
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it("the latch CLEARS, so the same page can be requested again later", () => {
    // Without the clearing effect the latch holds the last requested value
    // for the component's lifetime, and re-requesting that same page is
    // blocked permanently. Reachable whenever the page moves by some route
    // other than this pager — an external URL change, or a filter reset
    // that sends the caller back to an earlier page.
    const { rerender, onPageChange, props } = mount({ page: 2 });

    fireEvent.click(next());
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    // The request landed...
    rerender(<PagerNav {...props} page={3} />);
    // ...and then the page moved back by some other means.
    rerender(<PagerNav {...props} page={2} />);

    fireEvent.click(next());

    expect(onPageChange).toHaveBeenCalledTimes(2);
    expect(onPageChange).toHaveBeenLastCalledWith(3);
  });
});

describe("unchanged behaviour", () => {
  it("renders nothing below two pages", () => {
    const { container } = mount({ totalPages: 1 });
    expect(container.firstChild).toBeNull();
  });

  it("keeps both chips in the layout at a boundary so the row cannot shift", () => {
    mount({ page: 1 });
    const nav = screen.getByRole("navigation", { name: /pagination/i });
    expect(within(nav).getAllByRole("button")).toHaveLength(2);
  });

  it("still shows the page readout", () => {
    mount({ page: 2, totalPages: 5 });
    expect(screen.getByText("PAGE 2 / 5")).toBeTruthy();
  });
});
