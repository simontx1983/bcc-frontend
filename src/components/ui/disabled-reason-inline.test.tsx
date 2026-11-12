/**
 * User decision F-321 (2026-11-12): a disabled action shows WHY in a short
 * visible line under it — a title tooltip never appears on touch, so a
 * tapped VOUCH / WRITE A REVIEW did nothing and said nothing. Signed out,
 * the line links to sign-in and back; locked for another reason, it shows
 * the server's unlock hint verbatim. Signed-out JOIN HALL becomes a sign-in
 * link instead of a dead disabled button.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/v/atlas",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("@/components/composer/Composer", () => ({ Composer: () => null }));

import { EndorseButton } from "@/components/endorse/EndorseButton";
import { HallMembershipControls } from "@/components/halls/HallMembershipControls";
import { ReviewCallout } from "@/components/review/ReviewCallout";

afterEach(() => cleanup());

const wrap = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("VOUCH", () => {
  const base = { pageId: 7, pageName: "Atlas", hasEndorsed: false };

  it("signed out: a visible line with a sign-in link back to this page", () => {
    wrap(<EndorseButton {...base} canEndorse={false} unlockHint={null} viewerAuthed={false} />);
    const button = screen.getByRole("button", { name: "VOUCH" });
    expect(button).toBeDisabled();
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/login?callbackUrl=%2Fv%2Fatlas");
    const reason = link.closest("p") as HTMLElement;
    expect(reason).toHaveTextContent("Sign in to vouch.");
    expect(button).toHaveAttribute("aria-describedby", reason.id);
  });

  it("locked: the server's unlock hint, visible and described", () => {
    wrap(
      <EndorseButton {...base} canEndorse={false} unlockHint="Vouching unlocks at neutral reputation." viewerAuthed />,
    );
    const reason = screen.getByText("Vouching unlocks at neutral reputation.");
    expect(screen.getByRole("button", { name: "VOUCH" })).toHaveAttribute("aria-describedby", reason.id);
  });

  it("allowed: no reason line", () => {
    wrap(<EndorseButton {...base} canEndorse unlockHint={null} viewerAuthed />);
    expect(screen.getByRole("button", { name: "VOUCH" })).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/unlocks|Sign in/)).toBeNull();
  });
});

describe("WRITE A REVIEW", () => {
  const base = { target: { kind: "entity" as const, pageId: 7 }, pageName: "Atlas", hasReviewed: false };

  it("signed out: a visible line with a sign-in link", () => {
    wrap(<ReviewCallout {...base} canReview={false} unlockHint={null} viewerAuthed={false} />);
    expect(screen.getByRole("link", { name: "Sign in" }).closest("p")).toHaveTextContent("Sign in to write a review.");
  });

  it("locked: the server's unlock hint", () => {
    wrap(<ReviewCallout {...base} canReview={false} unlockHint="Reviews unlock at Level 2." viewerAuthed />);
    const reason = screen.getByText("Reviews unlock at Level 2.");
    expect(screen.getByRole("button", { name: "WRITE A REVIEW" })).toHaveAttribute("aria-describedby", reason.id);
  });
});

describe("JOIN HALL", () => {
  it("signed out: a sign-in link back to the Hall, not a dead disabled button", () => {
    wrap(<HallMembershipControls groupId={3} membership={null} />);
    expect(screen.queryByRole("button", { name: "JOIN HALL" })).toBeNull();
    expect(screen.getByRole("link", { name: "SIGN IN TO JOIN" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Fv%2Fatlas",
    );
  });
});
