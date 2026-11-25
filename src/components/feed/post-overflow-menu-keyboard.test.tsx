/**
 * F-264: the post "⋯" menu works from the keyboard.
 *
 * Before, it handled only Escape (through a window listener): no arrow
 * keys, no roving focus, and Report / Delete left focus nowhere once their
 * dialog closed. It now uses the shared menu-button contract
 * (useMenuButton, the same one ActionMenu uses) with its own "⋯" markup.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ReportButtonModule from "@/components/feed/ReportButton";
import type { FeedItem } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const report = vi.hoisted(() => ({ focusedAtOpen: null as Element | null }));
vi.mock("@/components/feed/ReportButton", async (importOriginal) => ({
  ...(await importOriginal<typeof ReportButtonModule>()),
  // Records where focus was when it opened (the shared Dialog restores
  // focus to exactly that element when it closes).
  ReportModal: ({ onClose }: { onClose: () => void }) => {
    if (report.focusedAtOpen === null) report.focusedAtOpen = document.activeElement;
    return (
      <div role="dialog" aria-label="Report this post">
        <button type="button" onClick={onClose}>
          CLOSE REPORT
        </button>
      </div>
    );
  },
}));

const { PostOverflowMenu } = await import("@/components/feed/PostOverflowMenu");

const allow = { allowed: true, unlock_hint: null };
const post = (permissions: Record<string, unknown>) =>
  ({ id: "feed_12", permissions, links: { self: "/post/feed_12" } }) as unknown as FeedItem;
const BOTH = post({ can_report: allow, can_delete: allow });

let qc: QueryClient;
const onCardClick = vi.fn();

/** `null` renders the menu with no item (Copy link only). */
function renderMenu(item: FeedItem | null = BOTH) {
  render(
    <QueryClientProvider client={qc}>
      {/* The card body navigates on click; the menu must never reach it. */}
      <div onClick={onCardClick}>
        <PostOverflowMenu selfHref="/post/feed_12" {...(item !== null ? { item } : {})} />
      </div>
    </QueryClientProvider>,
  );
}

const trigger = () => screen.getByRole("button", { name: "More actions" });
const menu = () => screen.getByRole("menu", { name: "More actions" });
const item = (name: string) => screen.getByRole("menuitem", { name });
const key = (el: Element, k: string) => fireEvent.keyDown(el, { key: k });

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  report.focusedAtOpen = null;
  onCardClick.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => undefined) },
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  qc.clear();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("opening from the keyboard", () => {
  it("Enter opens at the first item; the menu is named and controlled by the trigger", () => {
    renderMenu();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    key(trigger(), "Enter");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(trigger()).toHaveAttribute("aria-controls", menu().id);
    expect(item("Copy link")).toHaveFocus();
  });

  it("Space and ArrowDown open at the first item, ArrowUp at the last", () => {
    renderMenu();
    key(trigger(), " ");
    expect(item("Copy link")).toHaveFocus();
    key(menu(), "Escape");
    key(trigger(), "ArrowDown");
    expect(item("Copy link")).toHaveFocus();
    key(menu(), "Escape");
    key(trigger(), "ArrowUp");
    expect(item("Delete")).toHaveFocus();
  });

  it("a click opens at the first item too", () => {
    renderMenu();
    fireEvent.click(trigger());
    expect(item("Copy link")).toHaveFocus();
    expect(onCardClick).not.toHaveBeenCalled();
  });
});

describe("inside the menu", () => {
  it("arrows move and wrap, Home / End jump, and only the active item is tabbable", () => {
    renderMenu();
    key(trigger(), "Enter");
    // One tab stop: the active item only.
    expect(item("Copy link")).toHaveAttribute("tabindex", "0");
    expect(item("Report")).toHaveAttribute("tabindex", "-1");
    expect(item("Delete")).toHaveAttribute("tabindex", "-1");
    key(menu(), "ArrowDown");
    expect(item("Report")).toHaveFocus();
    expect(item("Report")).toHaveAttribute("tabindex", "0");
    expect(item("Copy link")).toHaveAttribute("tabindex", "-1");
    key(menu(), "ArrowDown");
    expect(item("Delete")).toHaveFocus();
    key(menu(), "ArrowDown");
    expect(item("Copy link")).toHaveFocus();
    key(menu(), "ArrowUp");
    expect(item("Delete")).toHaveFocus();
    key(menu(), "Home");
    expect(item("Copy link")).toHaveFocus();
    key(menu(), "End");
    expect(item("Delete")).toHaveFocus();
  });

  it("Escape closes and puts focus back on ⋯", () => {
    renderMenu();
    key(trigger(), "Enter");
    key(menu(), "ArrowDown");
    key(menu(), "Escape");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("Tab closes it", () => {
    renderMenu();
    key(trigger(), "Enter");
    key(menu(), "Tab");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("an outside press closes it", () => {
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a post you can delete but not report: two items, and the keys use exactly those two", () => {
    renderMenu(post({ can_delete: allow }));
    key(trigger(), "ArrowUp");
    expect(item("Delete")).toHaveFocus();
    key(menu(), "ArrowDown");
    expect(item("Copy link")).toHaveFocus();
    key(menu(), "ArrowDown");
    expect(item("Delete")).toHaveFocus();
    expect(screen.queryByRole("menuitem", { name: "Report" })).toBeNull();
  });

  it("with no item (Copy link only), the arrows stay on it", () => {
    renderMenu(null);
    key(trigger(), "Enter");
    key(menu(), "ArrowDown");
    expect(item("Copy link")).toHaveFocus();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });
});

describe("choosing an item", () => {
  it("Copy link keeps the menu open so 'Copied' can show, and never reaches the card", async () => {
    renderMenu();
    key(trigger(), "Enter");
    fireEvent.click(item("Copy link"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(menu()).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copied" })).toBeInTheDocument();
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("Delete closes the menu, and cancelling the confirm puts focus back on ⋯", () => {
    renderMenu();
    key(trigger(), "ArrowUp");
    expect(item("Delete")).toHaveFocus();
    fireEvent.click(item("Delete"));
    expect(screen.queryByRole("menu")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "Delete this post?" });
    fireEvent.click(screen.getByRole("button", { name: "CANCEL" }));
    expect(dialog).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("Report closes the menu and opens its dialog with focus parked on ⋯ (where it returns)", () => {
    renderMenu();
    key(trigger(), "Enter");
    key(menu(), "ArrowDown");
    fireEvent.click(item("Report"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Report this post" })).toBeInTheDocument();
    expect(report.focusedAtOpen).toBe(trigger());
  });
});
