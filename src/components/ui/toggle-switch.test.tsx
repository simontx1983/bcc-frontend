/**
 * ToggleSwitch — both looks are one accessible switch. The pill carries
 * its state in the ✓/○ glyph (and border/fill), not only in color, and
 * its label stays visible inside the accessible name.
 */

import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToggleSwitch } from "./ToggleSwitch";

afterEach(cleanup);

function Harness({ initial, variant }: { initial: boolean; variant?: "switch" | "pill" }) {
  const [value, setValue] = useState(initial);
  return (
    <ToggleSwitch
      label="Show on profile"
      ariaLabel="Show on profile: Halls"
      value={value}
      pending={false}
      onChange={setValue}
      {...(variant !== undefined ? { variant } : {})}
    />
  );
}

describe("ToggleSwitch pill", () => {
  it("is a switch whose aria-checked, glyph and label follow the value", () => {
    const { container } = render(<Harness initial variant="pill" />);
    const sw = within(container).getByRole("switch", { name: "Show on profile: Halls" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(sw.textContent).toBe("✓Show on profile");

    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw.textContent).toBe("○Show on profile");

    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("the whole button is the ≥44px tap target", () => {
    const { container } = render(<Harness initial variant="pill" />);
    expect(within(container).getByRole("switch").className).toContain("min-h-[44px]");
  });

  it("pending disables it and swallows the click", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ToggleSwitch variant="pill" label="Show on profile" value pending onChange={onChange} />,
    );
    const sw = within(container).getByRole("switch", { name: "Show on profile" });
    expect(sw).toBeDisabled();
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ToggleSwitch default (switch) look", () => {
  it("keeps the settings behavior: role=switch, label as name, toggles", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ToggleSwitch label="Auto-join eligible communities" value={false} pending={false} onChange={onChange} />,
    );
    const sw = within(container).getByRole("switch", { name: "Auto-join eligible communities" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw.textContent).toBe("");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
