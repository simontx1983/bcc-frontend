/**
 * Test helper for the card pill notice line (CardActionBar).
 *
 * The line mounts EMPTY and its first text arrives a beat later
 * (NOTICE_FILL_DELAY_MS): a live region inserted already holding its text
 * is often not read. So a test that clicks and then reads the text must
 * wait for it. This returns the region once it has text.
 */

import { screen, waitFor } from "@testing-library/react";

export function filledNotice(role: "status" | "alert"): Promise<HTMLElement> {
  return waitFor(() => {
    const region = screen.getByRole(role);
    if ((region.textContent ?? "") === "") throw new Error(`${role} region not filled yet`);
    return region;
  });
}
