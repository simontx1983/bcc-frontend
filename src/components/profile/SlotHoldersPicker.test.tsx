/**
 * SlotHoldersPicker — modal accessibility regression cover.
 *
 * The picker used to hand-roll its own modal shell: `role="dialog"` at
 * z-50 (below the header and MobileNav) with no focus trap, no ESC, no
 * scroll lock, no focus return and no portal. It now composes the shared
 * `Dialog`. These tests pin the behaviour that migration bought, and —
 * just as importantly — the guarded dismiss policy it had to preserve:
 * while a release or retry-cast is in flight, none of the three dismissal
 * paths may strand the operator mid-flow.
 *
 * Assertions target public behaviour (focus, keyboard, dismissal, ARIA)
 * rather than markup. The one exception is the z-band, asserted once:
 * the original defect was purely a layering value, so it needs a pin.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SlotHoldersPicker } from "@/components/profile/SlotHoldersPicker";
import type { SlotHolder } from "@/lib/api/types";

// ── jsdom gaps ────────────────────────────────────────────────────────
// Two stubs, both required by Dialog rather than by these tests:
//
//  1. `matchMedia` — Dialog's usePrefersReducedMotion calls it on mount;
//     jsdom does not implement it at all.
//  2. `offsetParent` — Dialog filters its focusables on
//     `offsetParent !== null` to skip hidden controls. jsdom has no layout
//     engine so this is always null, which would collapse the focusable
//     set to one element and make the trap untestable.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
  });

  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

// vitest.config.ts does not set `globals`, so RTL's auto-cleanup is never
// registered. Without this, portalled dialogs and Dialog's scroll lock
// leak into the next test.
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  (document.activeElement as HTMLElement | null)?.blur?.();
});

const HOLDERS = [
  {
    id: 11,
    target_label: "Ada Ironside",
    target_url: "/u/ada",
    cast_at: "2026-08-01T10:00:00Z",
    note: null,
  },
  {
    id: 12,
    target_label: "Bo Welder",
    target_url: "/u/bo",
    cast_at: "2026-08-02T10:00:00Z",
    note: null,
  },
] as unknown as SlotHolder[];

type Props = Parameters<typeof SlotHoldersPicker>[0];

function mount(overrides: Partial<Props> = {}) {
  const onDismiss = vi.fn();
  const onRelease = vi.fn();
  const utils = render(
    <SlotHoldersPicker
      open
      holders={HOLDERS}
      slotsTotal={2}
      releasingHolderId={null}
      retryingCast={false}
      error={null}
      onRelease={onRelease}
      onDismiss={onDismiss}
      {...overrides}
    />,
  );
  return { ...utils, onDismiss, onRelease };
}

/** Dialog puts role="dialog" on the backdrop; the panel is its child. */
const backdrop = () => screen.getByRole("dialog");
const panel = () => backdrop().firstElementChild as HTMLElement;
const closeButton = () => screen.getByRole("button", { name: /close/i });
const focusables = () =>
  Array.from(
    backdrop().querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  );

/** The three ways a user can ask to dismiss. */
const DISMISSALS = {
  Escape: () => fireEvent.keyDown(document, { key: "Escape" }),
  "backdrop click": () => fireEvent.click(backdrop()),
  "Close button": () => fireEvent.click(closeButton()),
};

/** The two in-flight states that must hold the picker open. */
const PENDING: Record<string, Partial<Props>> = {
  "release in flight": { releasingHolderId: 11 },
  "retry-cast in flight": { releasingHolderId: 11, retryingCast: true },
};

describe("SlotHoldersPicker — mounting", () => {
  it("renders nothing when closed", () => {
    const { container } = mount({ open: false });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("portals out of the React tree so no ancestor can clip it", () => {
    const { container } = mount();
    expect(container).toBeEmptyDOMElement();
    expect(document.body.contains(backdrop())).toBe(true);
  });

  it('exposes a modal dialog named "Backing"', () => {
    mount();
    expect(backdrop()).toHaveAttribute("aria-modal", "true");
    expect(backdrop()).toHaveAccessibleName("Backing");
  });

  it("sits in the Dialog z-band, above the header and MobileNav", () => {
    // Doctrine §401: MobileNav 200 · header 300 · offcanvas 400 ·
    // hovercard 500 · Dialog 550. The pre-migration picker was z-50.
    mount();
    expect(backdrop().className).toContain("z-[550]");
  });
});

describe("SlotHoldersPicker — focus management", () => {
  it("moves focus into the dialog on open", () => {
    mount();
    expect(backdrop().contains(document.activeElement)).toBe(true);
  });

  it("returns focus to the opener on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = mount();
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("wraps Tab from the last control back to the first", () => {
    mount();
    const items = focusables();
    expect(items.length).toBeGreaterThan(1);

    items[items.length - 1]!.focus();
    fireEvent.keyDown(backdrop(), { key: "Tab" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("wraps Shift+Tab from the first control back to the last", () => {
    mount();
    const items = focusables();

    items[0]!.focus();
    fireEvent.keyDown(backdrop(), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

describe("SlotHoldersPicker — scroll lock", () => {
  it("locks body scroll while open and restores it on close", () => {
    document.body.style.overflow = "";
    const { unmount } = mount();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("SlotHoldersPicker — dismissal when idle", () => {
  for (const [name, dismiss] of Object.entries(DISMISSALS)) {
    it(`${name} closes the picker`, () => {
      const { onDismiss } = mount();
      dismiss();
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  }

  it("a click inside the panel does not close it", () => {
    const { onDismiss } = mount();
    fireEvent.click(panel());
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("SlotHoldersPicker — dismissal is held while a mutation is pending", () => {
  for (const [state, props] of Object.entries(PENDING)) {
    describe(state, () => {
      it("disables the Close button natively", () => {
        mount(props);
        expect(closeButton()).toBeDisabled();
      });

      it("removes the Close button from the focus order", () => {
        mount(props);
        expect(focusables()).not.toContain(closeButton());
      });

      for (const [name, dismiss] of Object.entries(DISMISSALS)) {
        it(`${name} does not close the picker`, () => {
          const { onDismiss } = mount(props);
          dismiss();
          expect(onDismiss).not.toHaveBeenCalled();
        });
      }
    });
  }

  it("re-enables the Close button once the mutation settles", () => {
    const { rerender, onDismiss } = mount({ releasingHolderId: 11 });
    expect(closeButton()).toBeDisabled();

    rerender(
      <SlotHoldersPicker
        open
        holders={HOLDERS}
        slotsTotal={2}
        releasingHolderId={null}
        retryingCast={false}
        error={null}
        onRelease={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    expect(closeButton()).toBeEnabled();
    fireEvent.click(closeButton());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("SlotHoldersPicker — row behaviour is unchanged", () => {
  it("renders one Release control per holder and reports the id released", () => {
    const { onRelease } = mount();
    const releases = screen.getAllByRole("button", { name: /release/i });
    expect(releases).toHaveLength(HOLDERS.length);

    fireEvent.click(releases[1]!);
    expect(onRelease).toHaveBeenCalledWith(12);
  });

  it("marks the releasing row busy and locks the sibling rows", () => {
    mount({ releasingHolderId: 11 });
    const rows = screen.getAllByRole("button", { name: /release|releasing/i });

    expect(rows.some((b) => b.getAttribute("aria-busy") === "true")).toBe(true);
    expect(rows.some((b) => b.hasAttribute("disabled"))).toBe(true);
  });

  it("renders the empty state when there are no holders", () => {
    mount({ holders: [] });
    expect(
      screen.getByText("No active commitments to show. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /release/i }),
    ).not.toBeInTheDocument();
  });
});
