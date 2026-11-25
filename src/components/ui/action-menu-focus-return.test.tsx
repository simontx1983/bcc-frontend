/**
 * ActionMenu, focus return after an item has been chosen once.
 *
 * Choosing an item closes the menu without pulling focus back (the action
 * owns focus from there). That used to be done with a flag that nothing
 * reset, so the NEXT time the menu was opened and closed with Escape,
 * focus stayed lost instead of returning to the trigger.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionMenu } from "@/components/ui/ActionMenu";

afterEach(cleanup);

function menu(onSelect = vi.fn()) {
  render(
    <ActionMenu
      triggerLabel="EDIT"
      groups={[
        {
          id: "g",
          label: "Group",
          items: [
            { id: "a", label: "Alpha", onSelect },
            { id: "b", label: "Beta", onSelect: vi.fn() },
          ],
        },
      ]}
    />,
  );
  return { trigger: screen.getByRole("button", { name: /EDIT/ }), onSelect };
}

describe("ActionMenu focus return", () => {
  it("after an item was chosen, the next Escape still returns focus to the trigger", () => {
    const { trigger, onSelect } = menu();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Alpha" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("choosing an item closes the menu without pulling focus back: the action owns it", () => {
    const { trigger, onSelect } = menu();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).not.toHaveFocus();
  });
});

describe("ActionMenu disabled items and the pointer", () => {
  function three() {
    render(
      <ActionMenu
        triggerLabel="EDIT"
        groups={[
          {
            id: "g",
            label: "Group",
            items: [
              { id: "a", label: "Alpha", onSelect: vi.fn() },
              { id: "b", label: "Beta", onSelect: vi.fn(), disabled: true },
              { id: "c", label: "Gamma", onSelect: vi.fn() },
            ],
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /EDIT/ }));
    return screen.getByRole("menu");
  }

  it("the arrows skip a disabled item, both ways", () => {
    const m = three();
    expect(screen.getByRole("menuitem", { name: "Alpha" })).toHaveFocus();
    fireEvent.keyDown(m, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Gamma" })).toHaveFocus();
    fireEvent.keyDown(m, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Alpha" })).toHaveFocus();
  });

  it("the pointer over an enabled item makes it active; over a disabled one, nothing changes", () => {
    three();
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Gamma" }));
    expect(screen.getByRole("menuitem", { name: "Gamma" })).toHaveFocus();
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Beta" }));
    expect(screen.getByRole("menuitem", { name: "Gamma" })).toHaveFocus();
    // The roving tab stop stays on Gamma, never on the inert Beta.
    expect(screen.getByRole("menuitem", { name: "Gamma" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("menuitem", { name: "Beta" })).toHaveAttribute("tabindex", "-1");
  });
});

describe("ActionMenu Escape stays with the menu", () => {
  it("inside a dialog, Escape closes the menu only; the next Escape closes the dialog", async () => {
    const { Dialog } = await import("@/components/ui/Dialog");
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    const onClose = vi.fn();
    render(
      <Dialog title="Host" onClose={onClose}>
        <ActionMenu
          triggerLabel="EDIT"
          groups={[{ id: "g", label: "Group", items: [{ id: "a", label: "Alpha", onSelect: vi.fn() }] }]}
        />
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: /EDIT/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("only Escape is held back: the menu's other keys still reach window", () => {
    const seen: string[] = [];
    const onKey = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener("keydown", onKey);
    try {
      menu();
      fireEvent.click(screen.getByRole("button", { name: /EDIT/ }));
      fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      expect(seen).toEqual(["ArrowDown"]);
    } finally {
      window.removeEventListener("keydown", onKey);
    }
  });
});
