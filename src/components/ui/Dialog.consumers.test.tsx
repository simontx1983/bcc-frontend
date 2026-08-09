/**
 * Modal-shell regression cover for the components migrated onto the
 * shared `Dialog` primitive in Batch D2.
 *
 * Each of these used to hand-roll its own overlay — `role="dialog"` and
 * `aria-modal` declared, but no portal, no canonical layering, no focus
 * entry, no focus trap, no scroll lock, and in some cases no Escape.
 *
 * The migration was deliberately accessibility-only: every one uses
 * Dialog's `bare` mode so its own panel surface, padding, backdrop tint
 * and Close control survive untouched. That makes the visual contract
 * part of the regression being protected, so it is asserted here
 * alongside the behaviour — a later "tidy-up" that quietly swaps a
 * consumer onto Dialog's canonical chrome should fail these tests.
 *
 * Assertions target public behaviour — roles, accessible names, real
 * focus and keyboard. Where appearance is pinned it is pinned as
 * individual utilities, never a whole class string.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Mocked at the hook/module boundary so the API client — and the env
// vars it demands at import time — stay out of this test's import graph.
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/hooks/useReportContent", () => ({
  useReportContent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useReportUser", () => ({
  useReportUser: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/auth/WalletAuthButton", () => ({
  WalletAuthButton: () => <button type="button">Continue with wallet</button>,
}));
vi.mock("@/hooks/useAdminReports", () => ({
  ADMIN_REPORTS_QUERY_KEY_ROOT: ["admin", "reports"],
  DEFAULT_ADMIN_REPORTS_FILTERS: { status: "open", reporterHandle: "" },
  useAdminReports: () => ({
    isPending: false,
    isError: false,
    data: {
      items: [],
      pagination: { page: 1, per_page: 20, total: 0, total_pages: 1 },
    },
  }),
  useResolveAdminReport: () => ({ mutate: vi.fn(), isPending: false }),
  useUndoAdminReport: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ModerationQueue } from "@/components/admin/ModerationQueue";
import { SignOutModal } from "@/components/auth/SignOutModal";
import { WalletSignupPrompt } from "@/components/auth/WalletSignupPrompt";
import { ReportModal } from "@/components/feed/ReportButton";
import { ReportMemberModal } from "@/components/profile/ReportMemberModal";

// ── jsdom gaps ────────────────────────────────────────────────────────
// Both stubs are required by Dialog, not by these assertions:
//  1. `matchMedia` — Dialog's usePrefersReducedMotion calls it; jsdom
//     does not implement it at all.
//  2. `offsetParent` — Dialog filters focusables on `offsetParent !==
//     null`. jsdom has no layout engine so it is always null, which
//     would collapse the focusable set and make the trap untestable.
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

// vitest.config.ts does not set `globals`, so RTL auto-cleanup is never
// registered — portalled nodes and Dialog's scroll lock would leak.
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  (document.activeElement as HTMLElement | null)?.blur?.();
});

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const dialog = () => screen.getByRole("dialog");
const panel = () => dialog().firstElementChild as HTMLElement;
const focusables = () =>
  Array.from(dialog().querySelectorAll<HTMLElement>(FOCUSABLE));

interface Consumer {
  name: string;
  title: string;
  /** Mount and get the modal on screen the way a user would. */
  open: (onClose: () => void) => ReturnType<typeof render>;
  /** Backdrop tint utility that must survive the migration. */
  backdrop: string;
  /** Panel utilities that must survive, asserted individually. */
  panelClasses: string[];
  /** Accessible name of the preserved in-panel Close control, if any. */
  closeControl: RegExp | null;
}

const CONSUMERS: Consumer[] = [
  {
    name: "ReportModal",
    title: "Report this post",
    open: (onClose) =>
      render(<ReportModal targetKind="feed_item" targetId={1} onClose={onClose} />),
    backdrop: "bg-ink/70",
    panelClasses: ["bcc-panel", "max-w-md", "max-h-[90vh]", "p-4", "sm:p-6"],
    closeControl: /^close$/i,
  },
  {
    name: "ReportMemberModal",
    title: "Report this member",
    open: (onClose) => render(<ReportMemberModal reportedUserId={7} onClose={onClose} />),
    backdrop: "bg-ink/70",
    panelClasses: ["bcc-panel", "max-w-md", "max-h-[90vh]", "p-4", "sm:p-6"],
    closeControl: /^close$/i,
  },
  {
    name: "WalletSignupPrompt",
    title: "Create an account for this wallet",
    open: (onClose) =>
      render(<WalletSignupPrompt onSuccess={() => {}} onDismiss={onClose} />),
    backdrop: "bg-ink/60",
    panelClasses: ["bcc-panel", "max-w-md", "p-8"],
    closeControl: null,
  },
  {
    name: "SignOutModal",
    title: "Sign out",
    open: (onClose) => render(<SignOutModal onClose={onClose} />),
    backdrop: "bg-bcc-black/55",
    panelClasses: ["bcc-signout-modal"],
    closeControl: null,
  },
  {
    name: "ShortcutOverlay",
    title: "Keyboard shortcuts",
    // Driven through ModerationQueue's public interaction — `?` opens the
    // sheet — rather than by exporting a private component for testing.
    // `onClose` is owned by the parent, so dismissal is asserted by the
    // dialog leaving the DOM instead of by a spy.
    open: () => {
      const utils = render(<ModerationQueue />);
      fireEvent.keyDown(window, { key: "?" });
      return utils;
    },
    backdrop: "bg-ink/70",
    panelClasses: ["bcc-panel", "max-w-md", "p-6"],
    closeControl: /close shortcut sheet/i,
  },
];

for (const consumer of CONSUMERS) {
  describe(`${consumer.name} — shared Dialog shell`, () => {
    const open = (onClose: () => void = () => {}) => consumer.open(onClose);

    // ── accessibility gained ──────────────────────────────────────────
    it("portals out of the React tree so no ancestor can clip it", () => {
      open();
      expect(document.body.contains(dialog())).toBe(true);
      expect(dialog().closest("[data-testid]")).toBeNull();
    });

    it("is a modal dialog with the expected accessible name", () => {
      open();
      expect(dialog()).toHaveAttribute("aria-modal", "true");
      expect(dialog()).toHaveAccessibleName(consumer.title);
    });

    it("sits in the Dialog z-band, above the header and MobileNav", () => {
      // Doctrine §401: MobileNav 200 · header 300 · offcanvas 400 ·
      // hovercard 500 · Dialog 550.
      open();
      expect(dialog()).toHaveClass("z-[550]");
    });

    it("moves focus into the dialog on open", () => {
      open();
      expect(dialog().contains(document.activeElement)).toBe(true);
    });

    it("traps Tab — the last control wraps to the first", () => {
      open();
      const items = focusables();
      expect(items.length).toBeGreaterThan(0);

      items[items.length - 1]!.focus();
      fireEvent.keyDown(dialog(), { key: "Tab" });
      // ShortcutOverlay has exactly one focusable (its CLOSE button), so
      // for it this asserts the stricter thing: focus cannot leave at all.
      expect(document.activeElement).toBe(items[0]);
    });

    it("locks body scroll while open and restores it on close", () => {
      document.body.style.overflow = "";
      const { unmount } = open();
      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(document.body.style.overflow).not.toBe("hidden");
    });

    it("Escape dismisses", () => {
      const onClose = vi.fn();
      open(onClose);
      fireEvent.keyDown(document, { key: "Escape" });

      if (consumer.name === "ShortcutOverlay") {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      } else {
        expect(onClose).toHaveBeenCalled();
      }
    });

    it("backdrop click dismisses", () => {
      const onClose = vi.fn();
      open(onClose);
      fireEvent.click(dialog());

      if (consumer.name === "ShortcutOverlay") {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      } else {
        expect(onClose).toHaveBeenCalled();
      }
    });

    // ── appearance preserved ──────────────────────────────────────────
    it(`keeps its own ${consumer.backdrop} backdrop with no blur`, () => {
      open();
      expect(dialog()).toHaveClass(consumer.backdrop);
      expect(dialog().className).not.toMatch(/backdrop-blur/);
    });

    it("keeps its own panel chrome", () => {
      open();
      for (const cls of consumer.panelClasses) {
        expect(panel()).toHaveClass(cls);
      }
    });

    it(
      consumer.closeControl === null
        ? "renders no corner close control, as before"
        : "keeps its own CLOSE control rather than Dialog's ✕",
      () => {
        open();
        if (consumer.closeControl === null) {
          expect(
            screen.queryByRole("button", { name: /close/i }),
          ).not.toBeInTheDocument();
        } else {
          const close = screen.getByRole("button", {
            name: consumer.closeControl,
          });
          expect(close).toHaveTextContent("CLOSE");
        }
      },
    );
  });
}

// ── per-consumer specifics the table can't express ────────────────────

describe("focus returns to the opener", () => {
  // Split out of the table because ShortcutOverlay's opener is a
  // keypress, not a button — there is no opener element to return to.
  for (const [name, ui] of [
    ["ReportModal", <ReportModal key="a" targetKind="feed_item" targetId={1} onClose={() => {}} />],
    ["ReportMemberModal", <ReportMemberModal key="b" reportedUserId={7} onClose={() => {}} />],
    ["WalletSignupPrompt", <WalletSignupPrompt key="c" onSuccess={() => {}} onDismiss={() => {}} />],
    ["SignOutModal", <SignOutModal key="d" onClose={() => {}} />],
  ] as const) {
    it(`${name} returns focus to the opener on close`, () => {
      const opener = document.createElement("button");
      document.body.appendChild(opener);
      opener.focus();

      const { unmount } = render(ui);
      unmount();

      expect(document.activeElement).toBe(opener);
      opener.remove();
    });
  }
});

describe("WalletSignupPrompt — bare mode preserves initial focus", () => {
  it("focuses the handle input rather than a close button", () => {
    // With no corner ✕, the handle input is the panel's first focusable,
    // so Dialog's focus-on-open lands exactly where the component's own
    // (now-deleted) focus effect used to put it.
    render(<WalletSignupPrompt onSuccess={() => {}} onDismiss={() => {}} />);

    const active = document.activeElement as HTMLElement;
    expect(active.tagName).toBe("INPUT");
    expect(active).toHaveAttribute("autocomplete", "username");
  });
});

describe("SignOutModal — pending state", () => {
  it("disables both actions while signing out, and stays dismissible", () => {
    // Dismissal is deliberately NOT guarded: sign-out is a single
    // idempotent call, and both buttons are already disabled, so
    // guarding the backdrop too would leave no exit if it hung.
    const onClose = vi.fn();
    render(<SignOutModal onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    expect(screen.getByRole("button", { name: /signing out/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the glass blur layer that Dialog's own glass tier would replace", () => {
    render(<SignOutModal onClose={() => {}} />);
    expect(panel().querySelector(".bcc-signout-blur-layer")).not.toBeNull();
    expect(panel().querySelector(".bcc-signout-content")).not.toBeNull();
  });
});

describe("ShortcutOverlay — Escape is owned by Dialog alone", () => {
  it("does not render until the ? shortcut is pressed", () => {
    render(<ModerationQueue />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("its own CLOSE button dismisses the sheet", () => {
    render(<ModerationQueue />);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close shortcut sheet/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape with the sheet closed does not disturb the queue", () => {
    // The parent's Escape registration was removed. Proving it is gone
    // and harmless: pressing Escape with no sheet open is a no-op, and
    // the sheet still opens afterwards.
    render(<ModerationQueue />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("migrated content is unchanged", () => {
  it("ReportModal keeps its six reasons and submit control", () => {
    render(<ReportModal targetKind="feed_item" targetId={1} onClose={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(screen.getByRole("button", { name: /submit report/i })).toBeInTheDocument();
  });

  it("ReportMemberModal keeps its seven reasons and submit control", () => {
    render(<ReportMemberModal reportedUserId={7} onClose={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.getByRole("button", { name: /submit report/i })).toBeInTheDocument();
  });

  it("SignOutModal keeps its confirmation copy and both actions", () => {
    render(<SignOutModal onClose={() => {}} />);
    expect(screen.getByText("Are you sure you want to sign out?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sign out$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("WalletSignupPrompt keeps its three fields and cancel", () => {
    render(<WalletSignupPrompt onSuccess={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText("Handle")).toBeInTheDocument();
    expect(screen.getByText("Display name (optional)")).toBeInTheDocument();
    expect(screen.getByText("Email (optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("ShortcutOverlay keeps all seven shortcut rows", () => {
    render(<ModerationQueue />);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText("Close this sheet")).toBeInTheDocument();
  });
});
