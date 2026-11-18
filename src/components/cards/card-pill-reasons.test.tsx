/**
 * User decision F-321, part 2 — the trading-card pills. A disabled Watch /
 * Vouch pill explained itself only in a title tooltip, which never shows
 * on a phone: a tap did nothing and said nothing. Now:
 *   - signed out (signin_required / auth_required): the pill is a link to
 *     sign in and come back;
 *   - locked for another reason: the pill stays focusable (aria-disabled)
 *     and a tap shows the reason in a short status line under the pills,
 *     which fades after a few seconds;
 *   - a failed watch shows in that line as an alert (it was tooltip-only).
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/directory" }));

const watchMutate = vi.fn();
vi.mock("@/hooks/useWatch", () => ({
  useWatchMutation: () => ({ mutate: watchMutate, isPending: false }),
  useUnwatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
  watchErrorCopy: () => "Couldn't watch this card. Try again.",
}));
vi.mock("@/hooks/useWatching", () => ({
  useWatching: () => ({ data: { items: [] } }),
}));
const castMutate = vi.fn();
vi.mock("@/hooks/useAttestations", () => ({
  useCastAttestation: () => ({ mutate: castMutate, isPending: false }),
  useRevokeAttestation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { ActionBar, CommunityActionBar } = await import("@/components/cards/CardActionBar");

function card(permissions: Record<string, unknown>) {
  return {
    id: 7,
    name: "Atlas",
    card_kind: "validator",
    permissions,
    viewer_attestation: null,
    // F-255: page cards carry the viewer's watch answer; without it the
    // Watch pill is "unknown" and locked.
    viewer_is_watching: false,
    viewer_watch: null,
    links: { self: "/v/atlas" },
  } as never;
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  watchMutate.mockReset();
  castMutate.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("signed out", () => {
  it("Watch and Vouch are sign-in links back to this page", () => {
    const sign = { allowed: false, unlock_hint: "Sign in to interact", reason_code: "signin_required" };
    render(<ActionBar card={card({ can_watch: sign, can_vouch: sign })} isPulled={false} />);
    expect(screen.getByRole("link", { name: "Sign in to watch Atlas" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Fdirectory",
    );
    expect(screen.getByRole("link", { name: "Sign in to vouch for Atlas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Watch Atlas|Vouch for Atlas/ })).toBeNull();
  });

  it("auth_required is treated the same", () => {
    const sign = { allowed: false, unlock_hint: null, reason_code: "auth_required" };
    render(<ActionBar card={card({ can_watch: sign, can_vouch: sign })} isPulled={false} />);
    expect(screen.getByRole("link", { name: "Sign in to watch Atlas" })).toBeInTheDocument();
  });
});

describe("locked for another reason", () => {
  const perms = {
    can_watch: { allowed: true, unlock_hint: null },
    can_vouch: { allowed: false, unlock_hint: "Vouching unlocks at neutral reputation.", reason_code: "tier_locked" },
  };

  it("a tap shows the reason under the pills, described and announced", () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    const vouch = screen.getByRole("button", { name: "Vouch for Atlas" });
    expect(vouch).not.toBeDisabled();
    expect(vouch).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(vouch);
    const line = screen.getByRole("status");
    expect(line).toHaveTextContent("Vouching unlocks at neutral reputation.");
    expect(vouch).toHaveAttribute("aria-describedby", line.id);
    expect(castMutate).not.toHaveBeenCalled();
  });

  it("the reason fades after a few seconds", () => {
    vi.useFakeTimers();
    render(<ActionBar card={card(perms)} isPulled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Vouch for Atlas" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("an allowed pill still acts and shows no line", () => {
    render(<ActionBar card={card(perms)} isPulled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Watch Atlas" }));
    expect(watchMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("a failed action", () => {
  it("shows the failure under the pills as an alert, not only in the tooltip", () => {
    watchMutate.mockImplementation((_vars: unknown, opts: { onError: (e: unknown) => void }) => {
      opts.onError(new Error("x"));
    });
    render(
      <ActionBar
        card={card({ can_watch: { allowed: true, unlock_hint: null }, can_vouch: { allowed: true, unlock_hint: null } })}
        isPulled={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Watch Atlas" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't watch this card. Try again.");
  });
});

describe("#276 review — the latest event wins", () => {
  it("a locked tap after a failed watch shows the reason, not the old error", () => {
    watchMutate.mockImplementation((_v: unknown, opts: { onError: (e: unknown) => void }) => {
      opts.onError(new Error("x"));
    });
    render(
      <ActionBar
        card={card({
          can_watch: { allowed: true, unlock_hint: null },
          can_vouch: { allowed: false, unlock_hint: "Vouching unlocks later.", reason_code: "tier_locked" },
        })}
        isPulled={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Watch Atlas" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't watch this card.");

    const vouch = screen.getByRole("button", { name: "Vouch for Atlas" });
    fireEvent.click(vouch);
    expect(screen.queryByRole("alert")).toBeNull();
    const line = screen.getByRole("status");
    expect(line).toHaveTextContent("Vouching unlocks later.");
    expect(vouch).toHaveAttribute("aria-describedby", line.id);
  });

  it("with no server hint the fallback is neutral, not a frontend-written rule", () => {
    render(
      <ActionBar
        card={card({
          can_watch: { allowed: true, unlock_hint: null },
          can_vouch: { allowed: false, unlock_hint: null, reason_code: "tier_locked" },
        })}
        isPulled={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Vouch for Atlas" }));
    expect(screen.getByRole("status")).toHaveTextContent("Not available yet.");
  });

  it("a disabled Message pill explains itself on tap", () => {
    render(
      <ActionBar
        card={{ ...(card({ can_watch: { allowed: true, unlock_hint: null }, can_vouch: { allowed: true, unlock_hint: null } }) as object), card_kind: "member" } as never}
        isPulled={false}
        messagePermissions={{ can_message: { allowed: false, unlock_hint: "Turn on direct messages first.", reason_code: "sender_chat_disabled" } }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Message/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Turn on direct messages first.");
  });
});

describe("#276 review — community pills", () => {
  function dossier(privacy: string) {
    return { type: "user", privacy, member_count: 3, verification: null, chain_tag: null, trust_min: null, collection_stats: null, viewer_is_member: false } as never;
  }

  it.each([
    ["closed", "Private", "This community is private."],
    ["secret", "Invite-only", "Members join by invitation."],
  ])("%s: the %s pill is focusable and a tap shows why", (privacy, _label, copy) => {
    render(<CommunityActionBar card={card({})} dossier={dossier(privacy)} isJoined={false} joinPending={false} />);
    const pill = screen.getByRole("button", { name: "Join Atlas" });
    expect(pill).not.toBeDisabled();
    expect(pill).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(pill);
    expect(screen.getByRole("status")).toHaveTextContent(copy);
  });
});
