/**
 * "Communities you qualify for" is dismissed per VIEWER, not per browser.
 *
 * The dismissal flag used to be the shared `bcc.communities.dismissed`, so
 * the first person to press Skip suppressed the activation prompt for
 * everyone who used the browser afterwards — each of whom qualifies for a
 * different set of communities, and none of whom chose to skip it.
 *
 * Fixtures only: a mocked session and a mocked holder-groups response.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HolderGroupItem } from "@/lib/api/types";

const sessionState = vi.hoisted(() => ({
  data: null as { user?: { id?: string } } | null,
  status: "loading" as "loading" | "authenticated" | "unauthenticated",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
}));

// jsdom has no matchMedia; the Dialog's reduced-motion hook calls it.
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

const eligible: HolderGroupItem[] = [
  {
    group_id: 7,
    slug: "blacksmith-holders",
    name: "Blacksmith Holders",
    member_count: 12,
    collection: {
      chain: "ethereum",
      contract: "0xabc",
      name: "Blacksmiths",
      image_url: null,
    },
    verification: { kind: "on_chain", label: "On-chain verified" },
    activity: {
      posts_last_7d: 9,
      last_activity_at: null,
      heat: "hot",
      heat_label: "Hot",
    },
  },
];

vi.mock("@/hooks/useHolderGroups", () => ({
  useMyHolderGroups: () => ({
    data: { joined: [], eligible_to_join: eligible },
    isLoading: false,
    error: null,
  }),
  useJoinHolderGroupMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

import { EligibleCommunitiesModal } from "@/components/auth/EligibleCommunitiesModal";

const DISMISS_KEY = (scope: string) => `bcc.communities.dismissed::${scope}`;

function signedIn(id: string): void {
  sessionState.data = { user: { id } };
  sessionState.status = "authenticated";
}

const prompt = () => screen.queryByText(/you already qualify/i);
const skip = () => screen.getByRole("button", { name: /skip|maybe later/i });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  sessionState.data = null;
  sessionState.status = "loading";
});

afterEach(() => {
  cleanup();
});

describe("the activation prompt is dismissed per viewer", () => {
  it("asks the second viewer even though the first skipped", () => {
    signedIn("a");
    const view = render(<EligibleCommunitiesModal />);
    expect(prompt()).not.toBeNull();
    fireEvent.click(skip());
    expect(prompt()).toBeNull();
    expect(window.sessionStorage.getItem(DISMISS_KEY("a"))).toBe("1");

    signedIn("b");
    view.rerender(<EligibleCommunitiesModal />);
    expect(prompt()).not.toBeNull();
  });

  it("keeps the first viewer's dismissal when they come back", () => {
    signedIn("a");
    const view = render(<EligibleCommunitiesModal />);
    fireEvent.click(skip());
    signedIn("b");
    view.rerender(<EligibleCommunitiesModal />);
    signedIn("a");
    view.rerender(<EligibleCommunitiesModal />);
    expect(prompt()).toBeNull();
  });

  it("stays shut while the session is still loading", () => {
    render(<EligibleCommunitiesModal />);
    expect(prompt()).toBeNull();
  });

  it("stays shut for an authenticated session with no usable viewer id", () => {
    // Opening here would be unrecordable — the dismissal write is dropped
    // with an unknown scope, so Skip would not stick and the prompt would
    // re-open on every navigation. The session is "authenticated", so the
    // status gate alone does not catch this.
    sessionState.data = { user: {} };
    sessionState.status = "authenticated";
    render(<EligibleCommunitiesModal />);
    expect(prompt()).toBeNull();
  });

  it("ignores a LEGACY unscoped dismissal rather than honouring it", () => {
    // Someone else's skip, from before scoping. Honouring it would suppress
    // this viewer's activation moment on a choice they never made.
    window.sessionStorage.setItem("bcc.communities.dismissed", "1");
    signedIn("a");
    render(<EligibleCommunitiesModal />);
    expect(prompt()).not.toBeNull();
  });
});
