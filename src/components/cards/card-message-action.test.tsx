/**
 * Message action — rendering states, and the grid cards it must not reach.
 *
 * The affordance exists ONLY where a host surface hands down a live
 * permission. That is the mechanism keeping every directory, search and
 * watching card untouched, so "absent without the prop" is the single most
 * important assertion here.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useWatch", () => ({
  useWatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUnwatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useWatching", () => ({
  useWatching: () => ({ data: { items: [] } }),
}));
vi.mock("@/hooks/useAttestations", () => ({
  useCastAttestation: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeAttestation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { ActionBar } = await import("@/components/cards/CardActionBar");

/** Minimal member card. `id` IS the user id on this branch. */
const CARD = {
  id: 42,
  name: "Dana Reyes",
  card_kind: "member",
  permissions: {
    can_watch: { allowed: true, unlock_hint: null },
    can_vouch: { allowed: true, unlock_hint: null },
  },
  viewer_attestation: null,
  links: { self: "/u/dana" },
} as never;

function allow() {
  return { can_message: { allowed: true, unlock_hint: null } };
}
function denyWithHint(hint: string) {
  return { can_message: { allowed: false, unlock_hint: hint } };
}
function denyNoHint() {
  return { can_message: { allowed: false, unlock_hint: null } };
}

function renderBar(messagePermissions?: unknown) {
  return render(
    <ActionBar
      card={CARD}
      isPulled={false}
      {...(messagePermissions !== undefined ? { messagePermissions } : {})}
    />,
  );
}

const messageEl = () => screen.queryByText("Message");

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

describe("absent without the prop — the grid-safety property", () => {
  it("renders no Message action when no permission is passed", () => {
    renderBar();
    expect(messageEl()).toBeNull();
  });

  it("leaves the row at two pills, unstacked", () => {
    const { container } = renderBar();
    const row = container.querySelector(".bcc-card-actions");
    expect(row).not.toBeNull();
    // The stacked modifier is what reserves a second row; a grid card must
    // never get it, or every tile loses portrait height.
    expect(row?.classList.contains("bcc-card-actions-stacked")).toBe(false);
    expect(container.querySelectorAll(".bcc-card-pill")).toHaveLength(2);
  });

  it("ignores the prop on a non-member card", () => {
    render(
      <ActionBar
        card={{ ...(CARD as object), card_kind: "validator" } as never}
        isPulled={false}
        messagePermissions={allow()}
      />,
    );
    expect(messageEl()).toBeNull();
  });
});

describe("allowed", () => {
  it("renders a real navigable link to the pinned composer", () => {
    renderBar(allow());
    const link = screen.getByRole("link", { name: /message dana reyes/i });
    expect(link).toHaveAttribute("href", "/messages/new?to_user=42");
  });

  it("stacks the row so Watch and Vouch keep their own line", () => {
    const { container } = renderBar(allow());
    const row = container.querySelector(".bcc-card-actions");
    expect(row?.classList.contains("bcc-card-actions-stacked")).toBe(true);
    expect(container.querySelectorAll(".bcc-card-pill")).toHaveLength(3);
  });

  it("keeps the visible MESSAGE label rather than an icon alone", () => {
    renderBar(allow());
    expect(messageEl()).not.toBeNull();
  });
});

describe("denied WITH an unlock hint", () => {
  it("stays visible and keyboard-reachable, but is not a link", () => {
    renderBar(denyWithHint("Dana only accepts messages from people they follow."));
    expect(messageEl()).not.toBeNull();
    // No anchor: nothing to navigate to.
    expect(screen.queryByRole("link", { name: /message/i })).toBeNull();

    const btn = screen.getByRole("button", { name: /message/i });
    // aria-disabled, NOT the disabled attribute — a disabled button leaves the
    // tab order, which would make the explanation below unreachable.
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("exposes the reason through aria-describedby, not title alone", () => {
    const hint = "Dana only accepts messages from people they follow.";
    renderBar(denyWithHint(hint));

    const btn = screen.getByRole("button", { name: /message/i });
    const describedBy = btn.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();

    const description = document.getElementById(describedBy!);
    expect(description).not.toBeNull();
    expect(description?.textContent).toBe(hint);
  });
});

describe("denied WITHOUT a hint", () => {
  it("renders nothing rather than a dead control", () => {
    renderBar(denyNoHint());
    expect(messageEl()).toBeNull();
  });

  it("renders nothing for an empty-string hint", () => {
    renderBar({ can_message: { allowed: false, unlock_hint: "" } });
    expect(messageEl()).toBeNull();
  });
});

describe("malformed permission blocks degrade to hidden", () => {
  it.each([
    ["null", null],
    ["empty object", {}],
    ["missing allowed", { can_message: {} }],
    ["non-boolean allowed", { can_message: { allowed: "yes", unlock_hint: null } }],
  ])("hides on %s", (_label, permissions) => {
    renderBar(permissions);
    expect(messageEl()).toBeNull();
  });
});
