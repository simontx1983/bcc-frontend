/**
 * Never-claimed validator cards (messaging.destination "queue").
 *
 * No real operator stands behind such a page, so the card row offers
 * Watch + Message and NOT Vouch; the entity profile drops the
 * Vouch / Back / Report cluster. The signal is `messaging.destination`,
 * never `is_claimed`. Claimed validators and member cards are unchanged.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useWatch", () => ({
  useWatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUnwatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useWatching", () => ({
  useWatching: () => ({ data: { items: [] } }),
}));

// Capture the cast hook's options so a test can drive its onError.
const castOptions: { current: { onError?: (err: unknown) => void } | null } = {
  current: null,
};
vi.mock("@/hooks/useAttestations", () => ({
  useCastAttestation: (opts: { onError?: (err: unknown) => void }) => {
    castOptions.current = opts;
    return { mutate: vi.fn(), isPending: false };
  },
  useRevokeAttestation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { ActionBar } = await import("@/components/cards/CardActionBar");
const { BccApiError } = await import("@/lib/api/types");
const { ATTESTATION_COPY } = await import("@/lib/copy/trust-layer");

const allow = () => ({ allowed: true, unlock_hint: null });

function validatorCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 77,
    name: "Anvil Validator",
    card_kind: "validator",
    // Deliberately TRUE on the queue fixture: the hide must key on
    // destination, so a stale/ambiguous is_claimed cannot re-show Vouch.
    is_claimed: true,
    messaging: { destination: "queue", operator: null },
    permissions: {
      can_watch: allow(),
      can_vouch: allow(),
      can_stand_behind: allow(),
      can_report: allow(),
      can_message: allow(),
    },
    viewer_attestation: null,
    links: { self: "/v/anvil" },
    ...overrides,
  } as never;
}

const renderBar = (card: never) => render(<ActionBar card={card} isPulled={false} />);

const vouchPill = () => screen.queryByRole("button", { name: /vouch for/i });
const watchPill = () => screen.queryByRole("button", { name: /watch anvil|watch dana/i });

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

describe("never-claimed validator card (destination queue)", () => {
  it("renders no Vouch, Back or Report", () => {
    renderBar(validatorCard());
    expect(vouchPill()).toBeNull();
    expect(screen.queryByText("Vouch")).toBeNull();
    expect(screen.queryByText(/^back/i)).toBeNull();
    expect(screen.queryByText(/report/i)).toBeNull();
  });

  it("renders Message in the Vouch slot, linking to the pinned validator composer", () => {
    const { container } = renderBar(validatorCard());
    const link = screen.getByRole("link", { name: /message validator/i });
    expect(link).toHaveAttribute("href", "/messages/new?to_page=77&to_kind=validator");
    expect(link).toHaveAttribute("title", "Message Validator");
    // Two pills, unstacked — Message replaces Vouch rather than adding a row.
    const row = container.querySelector(".bcc-card-actions");
    expect(row?.classList.contains("bcc-card-actions-stacked")).toBe(false);
    expect(container.querySelectorAll(".bcc-card-pill")).toHaveLength(2);
  });

  it("keeps Watch", () => {
    renderBar(validatorCard());
    expect(watchPill()).not.toBeNull();
  });

  it("auth_required: visible-disabled with the frontend-owned hint, not a link", () => {
    renderBar(
      validatorCard({
        permissions: {
          can_watch: allow(),
          can_message: { allowed: false, unlock_hint: null, reason_code: "auth_required" },
        },
      }),
    );
    expect(screen.queryByRole("link", { name: /message/i })).toBeNull();
    const btn = screen.getByRole("button", { name: "Message Validator" });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    const describedBy = btn.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Sign in to send a message.",
    );
  });

  it("friends_only: visible-disabled with the SERVER hint", () => {
    renderBar(
      validatorCard({
        permissions: {
          can_watch: allow(),
          can_message: {
            allowed: false,
            unlock_hint: "Only friends can message this page.",
            reason_code: "friends_only",
          },
        },
      }),
    );
    const btn = screen.getByRole("button", { name: "Message Validator" });
    expect(btn).toHaveAttribute("title", "Only friends can message this page.");
  });

  it.each(["self_action_blocked", "messaging_unavailable", "unavailable", "not_applicable"])(
    "%s: hidden entirely, even with a hint",
    (code) => {
      renderBar(
        validatorCard({
          permissions: {
            can_watch: allow(),
            can_message: { allowed: false, unlock_hint: "Some hint.", reason_code: code },
          },
        }),
      );
      expect(screen.queryByText("Message")).toBeNull();
      expect(screen.queryByText("Some hint.")).toBeNull();
      expect(vouchPill()).toBeNull();
      expect(watchPill()).not.toBeNull();
    },
  );

  it("absent can_message gate: hidden", () => {
    renderBar(validatorCard({ permissions: { can_watch: allow() } }));
    expect(screen.queryByText("Message")).toBeNull();
  });
});

describe("claimed validator card (destination operator) — unchanged", () => {
  const claimed = () =>
    validatorCard({ messaging: { destination: "operator", operator: null } });

  it("still shows Watch + Vouch, and no Message pill", () => {
    const { container } = renderBar(claimed());
    expect(vouchPill()).not.toBeNull();
    expect(watchPill()).not.toBeNull();
    expect(screen.queryByText("Message")).toBeNull();
    expect(container.querySelectorAll(".bcc-card-pill")).toHaveLength(2);
  });

  it.each(["unavailable", "none"])("destination %s also keeps Vouch", (destination) => {
    renderBar(validatorCard({ messaging: { destination, operator: null } }));
    expect(vouchPill()).not.toBeNull();
    expect(screen.queryByText("Message")).toBeNull();
  });

  it("absent messaging block keeps Vouch (not inferred from is_claimed)", () => {
    renderBar(validatorCard({ messaging: undefined, is_claimed: false }));
    expect(vouchPill()).not.toBeNull();
  });
});

describe("member card — unchanged", () => {
  it("shows Watch + Vouch even if a queue-shaped messaging block were present", () => {
    renderBar(
      validatorCard({
        id: 42,
        name: "Dana Reyes",
        card_kind: "member",
        links: { self: "/u/dana" },
      }),
    );
    expect(screen.getByRole("button", { name: "Vouch for Dana Reyes" })).not.toBeNull();
    expect(screen.queryByText("Message")).toBeNull();
  });
});

describe("card vouch-cast failure copy", () => {
  const notFound = () => new BccApiError("bcc_not_found", "Target not found.", 404, null);

  it("maps bcc_not_found for a project page and keeps the generic line for members", () => {
    renderBar(validatorCard({ card_kind: "project", messaging: undefined }));
    act(() => castOptions.current?.onError?.(notFound()));
    expect(screen.getByRole("button", { name: /vouch for/i })).toHaveAttribute(
      "title",
      ATTESTATION_COPY.unclaimed_page_target,
    );
    cleanup();

    renderBar(validatorCard({ card_kind: "member", name: "Dana Reyes", messaging: undefined }));
    act(() => castOptions.current?.onError?.(notFound()));
    expect(screen.getByRole("button", { name: /vouch for/i })).toHaveAttribute(
      "title",
      "Couldn't update your vouch. Try again.",
    );
  });
});
