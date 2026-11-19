/**
 * F-332 follow-up: Settings → Account's recovery panel never offers a form
 * the server will refuse. It reads recovery.available_at / available_reason
 * (bcc-trust #658) through recoveryAvailability(), like the onboarding step
 * and the profile nudge:
 *   - open    → "Add recovery email" opens the form (as before)
 *   - later   → says when; no Add button
 *   - relogin → says how; no Add button
 * A form already open stays open when availability changes under it.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/hooks/useRecoveryEmail", () => ({
  useRequestRecoveryEmail: () => ({ mutate: vi.fn(), isPending: false }),
  useVerifyRecoveryEmail: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { RecoveryEmailPanel } from "@/components/settings/RecoveryEmail";
import type { LinkedWallet } from "@/lib/api/types";
import type { RecoveryAvailability } from "@/lib/onboarding/recovery-availability";

const wallet: LinkedWallet = {
  id: 1,
  wallet_address: "0xabc",
  chain_slug: "ethereum",
  chain_name: "Ethereum",
  chain_type: "evm",
  explorer_url: "",
  wallet_type: "user",
  label: "",
  is_primary: true,
  verified: true,
  created_at: null,
};

const onLinkAnotherWallet = vi.fn();

function panel(availability: RecoveryAvailability) {
  return (
    <RecoveryEmailPanel
      verifiedWalletCount={1}
      verifiedWallets={[wallet]}
      onLinkAnotherWallet={onLinkAnotherWallet}
      availability={availability}
    />
  );
}

afterEach(() => {
  cleanup();
  onLinkAnotherWallet.mockReset();
});

describe("Settings recovery panel — availability", () => {
  it("open: Add recovery email opens the form", () => {
    render(panel({ kind: "open" }));
    fireEvent.click(screen.getByRole("button", { name: "Add recovery email" }));
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByText(/You can add a recovery email from/)).toBeNull();
  });

  it("later: says when, offers no form, and linking another wallet stays", () => {
    render(panel({ kind: "later", at: "2026-12-01T12:00:00Z" }));
    expect(screen.getByText(/^You can add a recovery email from /)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add recovery email" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Link another wallet" }));
    expect(onLinkAnotherWallet).toHaveBeenCalledTimes(1);
  });

  it("relogin: says how, offers no form", () => {
    render(panel({ kind: "relogin" }));
    expect(
      screen.getByText(/Adding a recovery email needs a recently signed-in wallet\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add recovery email" })).toBeNull();
  });

  it("a form already open stays open when availability changes under it", () => {
    const { rerender } = render(panel({ kind: "open" }));
    fireEvent.click(screen.getByRole("button", { name: "Add recovery email" }));
    const field = screen.getByLabelText(/email/i);
    fireEvent.change(field, { target: { value: "me@example.com" } });
    rerender(panel({ kind: "later", at: "2026-12-01T12:00:00Z" }));
    expect(screen.getByLabelText(/email/i)).toHaveValue("me@example.com");
  });
});
