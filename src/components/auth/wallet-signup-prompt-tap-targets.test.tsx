/**
 * F-259 (the WalletSignupPrompt slice): the wallet sign-up dialog's own
 * form controls are 44px targets — the handle, display-name and email
 * fields, and Cancel. The wallet button inside belongs to WalletAuthButton
 * and is not part of this slice.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/components/auth/WalletAuthButton", () => ({ WalletAuthButton: () => null }));
vi.mock("@/lib/analytics/posthog", () => ({ captureAnalyticsEvent: vi.fn(), noteSignupCompleted: vi.fn() }));

const { WalletSignupPrompt } = await import("@/components/auth/WalletSignupPrompt");

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("the wallet sign-up dialog's tap targets", () => {
  it("every text field and Cancel are at least 44px tall", () => {
    render(<WalletSignupPrompt onSuccess={vi.fn()} onDismiss={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const fields = Array.from(dialog.querySelectorAll("input"));
    expect(fields.length).toBe(3);
    for (const field of fields) expect(field.className, field.outerHTML).toContain("min-h-[44px]");
    expect(screen.getByRole("button", { name: "Cancel" }).className).toContain("min-h-[44px]");
  });
});
