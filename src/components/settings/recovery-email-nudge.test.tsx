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

  it("on the Account tab itself the link can be hidden", () => {
    render(<RecoveryEmailNudge showLink={false} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("RecoveryEmailNudge on the Account tab", () => {
  it("can point at the in-page wallets section instead of reloading the tab", () => {
    render(<RecoveryEmailNudge href="#account-wallets" />);
    expect(screen.getByRole("link", { name: "Add recovery email" })).toHaveAttribute("href", "#account-wallets");
  });
});
