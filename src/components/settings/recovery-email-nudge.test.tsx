/**
 * F-332 (D): the recovery-email nudge shows ONLY when the server says the
 * account has no recovery email, and its copy stays calm (cadence policy).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ wallets: {} as unknown }));
vi.mock("@/hooks/useWallets", () => ({ useMyWallets: () => state.wallets }));

import { RecoveryEmailNudge } from "@/components/settings/RecoveryEmailNudge";

function wallets(recovery: unknown) {
  return { isPending: false, isError: false, data: { items: [], recovery } };
}

beforeEach(() => {
  state.wallets = wallets({ has_recovery_email: false, verified_wallet_count: 1 });
});
afterEach(() => cleanup());

describe("RecoveryEmailNudge", () => {
  it("no recovery email: one calm line and a link to Settings → Account", () => {
    render(<RecoveryEmailNudge />);
    const nudge = screen.getByRole("complementary", { name: "Account recovery" });
    expect(nudge).toHaveTextContent(
      "Add a recovery email so you can get back in if you lose access to your wallet.",
    );
    expect(screen.getByRole("link", { name: "Add recovery email" })).toHaveAttribute(
      "href",
      "/u/me?tab=account",
    );
    // cadence-pressure-guard:allow — asserting the nudge avoids these words
    expect(nudge.textContent ?? "").not.toMatch(/haven't|streak|days|should|don't forget/i);
  });

  it("a recovery email exists: nothing", () => {
    state.wallets = wallets({ has_recovery_email: true, verified_wallet_count: 1 });
    const { container } = render(<RecoveryEmailNudge />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["loading", { isPending: true, isError: false, data: undefined }],
    ["a failed read", { isPending: false, isError: true, data: undefined }],
  ])("%s: nothing (a missing nudge is harmless, a wrong one is noise)", (_l, w) => {
    state.wallets = w;
    const { container } = render(<RecoveryEmailNudge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("signup wallet (opens now): the link shows", () => {
    state.wallets = wallets({
      has_recovery_email: false,
      verified_wallet_count: 1,
      available_at: new Date().toISOString(),
      available_reason: "signup_wallet",
    });
    render(<RecoveryEmailNudge />);
    expect(screen.getByRole("link", { name: "Add recovery email" })).toBeInTheDocument();
  });

  it("wallet too new: says when, and no link to a form that would refuse", () => {
    state.wallets = wallets({
      has_recovery_email: false,
      verified_wallet_count: 1,
      available_at: new Date(Date.now() + 86_400_000).toISOString(),
      available_reason: "wallet_age",
    });
    render(<RecoveryEmailNudge />);
    expect(screen.getByRole("complementary", { name: "Account recovery" })).toHaveTextContent(
      /^You can add a recovery email from /,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("no recent wallet sign-in: says how, and no link", () => {
    state.wallets = wallets({
      has_recovery_email: false,
      verified_wallet_count: 1,
      available_at: null,
      available_reason: null,
    });
    render(<RecoveryEmailNudge />);
    expect(screen.getByRole("complementary", { name: "Account recovery" })).toHaveTextContent(
      "Adding a recovery email needs a recently signed-in wallet. Sign out and back in with your wallet to add one.",
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("a placing surface can point the link at its own Account tab", () => {
    render(<RecoveryEmailNudge href="/u/alice?tab=account" />);
    expect(screen.getByRole("link", { name: "Add recovery email" })).toHaveAttribute(
      "href",
      "/u/alice?tab=account",
    );
  });
});
