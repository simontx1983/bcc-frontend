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

  it("choosing an item does not pull focus back to the trigger", () => {
    const onSelect = vi.fn(() => {
      // The action takes focus somewhere else, as a dialog would.
      (document.body.appendChild(document.createElement("button")) as HTMLButtonElement).focus();
    });
    const { trigger } = menu(onSelect);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Alpha" }));
    expect(trigger).not.toHaveFocus();
  });
});
