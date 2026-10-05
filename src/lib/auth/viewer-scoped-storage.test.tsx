/**
 * Viewer-scoped storage, end to end through the real hooks.
 *
 * The defect this pins: browser storage outlives a session, so anything
 * written under a shared key is read back and DISPLAYED to whoever uses the
 * browser next. Recent searches rendered verbatim in someone else's search
 * dropdown is the clearest case; a tour position that suppresses another
 * person's onboarding and an unpublished blog body are the others.
 *
 * ⚠ What these tests do NOT claim: that one viewer's values are PRIVATE from
 * another person at the same browser. They are not — every scope is readable
 * in devtools. The guarantee is that the application never reads across
 * scopes, so nothing of A's is shown to B.
 *
 * Fixtures only: a mocked `useSession` whose value the tests move, never a
 * real session or a real account.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  data: null as { user?: { id?: string } } | null,
  status: "loading" as "loading" | "authenticated" | "unauthenticated",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
}));

// The server mirror is irrelevant here: these cases are about the LOCAL
// layer following the viewer. An empty server set keeps the union honest.
vi.mock("@/lib/api/tours-endpoints", () => ({
  getToursSeen: async () => ({ seen: [] as string[] }),
  markTourSeen: async (id: string) => ({ seen: [id] }),
}));

// jsdom has no matchMedia; the resume prompt's Dialog reads it.
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

import {
  __resetSessionIdentityForTests,
  noteEstablishedViewer,
} from "@/lib/auth/session-identity";
import { ResumeOnboardingPrompt } from "@/components/onboarding/ResumeOnboardingPrompt";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { useToursSeen } from "@/hooks/useToursSeen";
import { __resetViewerScopePurgeForTests, useViewerScope } from "@/hooks/useViewerScope";
import { ANON_SCOPE } from "@/lib/auth/viewer-scope";
import {
  dismissResume,
  getOnboardingProgress,
  isResumeDismissed,
  setOnboardingProgress,
} from "@/lib/onboarding/storage";
import {
  addLocalSeen,
  addSessionDismissed,
  getLocalSeen,
  isSessionDismissed,
} from "@/lib/tour/storage";

function signedIn(id: string): void {
  sessionState.data = { user: { id } };
  sessionState.status = "authenticated";
}

function signedOut(): void {
  sessionState.data = null;
  sessionState.status = "unauthenticated";
}

function stillLoading(): void {
  sessionState.data = null;
  sessionState.status = "loading";
}

/** Exercises the real hook: shows what it reads, lets a test write. */
function Recents() {
  const { recent, push } = useRecentSearches();
  return (
    <div>
      <ul data-testid="recent">
        {recent.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="push"
        onClick={() => {
          push("acme payroll leak");
        }}
      >
        search
      </button>
    </div>
  );
}

function ScopeReadout() {
  const scope = useViewerScope();
  return <div data-testid="scope">{scope ?? "(unknown)"}</div>;
}

const shown = () =>
  [...screen.getByTestId("recent").querySelectorAll("li")].map(
    (li) => li.textContent ?? "",
  );

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  __resetViewerScopePurgeForTests();
  __resetSessionIdentityForTests();
  stillLoading();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("one viewer's state is never shown to another", () => {
  it("does not read viewer A's recent searches for viewer B", () => {
    signedIn("a");
    const view = render(<Recents />);
    act(() => {
      screen.getByTestId("push").click();
    });
    expect(shown()).toEqual(["acme payroll leak"]);

    // B signs in on the same browser, no document load — the in-place
    // session flip every credentials sign-in in this app performs.
    signedIn("b");
    view.rerender(<Recents />);

    expect(shown()).toEqual([]);
    // A's value is still ON the device. That is the honest boundary: it is
    // not displayed, and nothing reads it, but it is not deleted either.
    expect(window.localStorage.getItem("bcc-recent-searches::a")).toContain(
      "acme payroll leak",
    );
  });

  it("gives each viewer their own tour seen-set", () => {
    addLocalSeen("a", "home-feed");
    expect(getLocalSeen("a")).toEqual(["home-feed"]);
    // B has seen nothing, so B's onboarding is not suppressed by A's.
    expect(getLocalSeen("b")).toEqual([]);
  });

  it("gives each viewer their own session dismissals", () => {
    addSessionDismissed("a", "home-feed");
    expect(isSessionDismissed("a", "home-feed")).toBe(true);
    expect(isSessionDismissed("b", "home-feed")).toBe(false);
  });

  it("gives each viewer their own onboarding resume point", () => {
    setOnboardingProgress("a", "notifications");
    expect(getOnboardingProgress("a")?.step).toBe("notifications");
    // Offering B "finish setting up?" from A's half-done wizard would both
    // mislead B and disclose where A got to.
    expect(getOnboardingProgress("b")).toBeNull();
  });

  it("gives each viewer their own resume dismissal", () => {
    dismissResume("a");
    expect(isResumeDismissed("a")).toBe(true);
    expect(isResumeDismissed("b")).toBe(false);
  });

  it("returns defaults — never the shared key — for every read with an unknown scope", () => {
    // A read is as dangerous as a write here: falling back to the bare name
    // would honour a dismissal nobody at this browser necessarily made, and
    // would show one viewer's position to an unidentified one.
    window.localStorage.setItem("bcc-tour-seen", '["home-feed"]');
    window.sessionStorage.setItem("bcc-tour-dismissed", '["home-feed"]');
    window.localStorage.setItem(
      "bcc-onboarding-progress",
      JSON.stringify({ step: "notifications", updatedAt: 1 }),
    );
    window.localStorage.setItem("bcc-onboarding-resume-dismissed", "1");

    expect(getLocalSeen(null)).toEqual([]);
    expect(isSessionDismissed(null, "home-feed")).toBe(false);
    expect(getOnboardingProgress(null)).toBeNull();
    expect(isResumeDismissed(null)).toBe(false);
  });

  it("drops every write made with an unknown scope", () => {
    addLocalSeen(null, "home-feed");
    addSessionDismissed(null, "home-feed");
    setOnboardingProgress(null, "notifications");
    dismissResume(null);
    expect(Object.keys(window.localStorage)).toEqual([]);
    expect(Object.keys(window.sessionStorage)).toEqual([]);
  });

  it("keeps an anonymous visitor's searches out of every account's scope", () => {
    signedOut();
    const view = render(<Recents />);
    act(() => {
      screen.getByTestId("push").click();
    });
    expect(shown()).toEqual(["acme payroll leak"]);
    expect(
      window.localStorage.getItem(`bcc-recent-searches::${ANON_SCOPE}`),
    ).toContain("acme payroll leak");

    signedIn("a");
    view.rerender(<Recents />);
    expect(shown()).toEqual([]);
  });

  it("does not show an account's searches to an anonymous visitor", () => {
    signedIn("a");
    const view = render(<Recents />);
    act(() => {
      screen.getByTestId("push").click();
    });
    expect(shown()).toEqual(["acme payroll leak"]);

    signedOut();
    view.rerender(<Recents />);
    expect(shown()).toEqual([]);
  });

  it("brings the viewer's own state back when they return", () => {
    signedIn("a");
    const view = render(<Recents />);
    act(() => {
      screen.getByTestId("push").click();
    });
    signedIn("b");
    view.rerender(<Recents />);
    expect(shown()).toEqual([]);
    signedIn("a");
    view.rerender(<Recents />);
    expect(shown()).toEqual(["acme payroll leak"]);
  });
});

describe("an unknown viewer is not a viewer", () => {
  it("reads nothing while the session is still loading", () => {
    // Seeded as if a previous viewer had left this behind.
    window.localStorage.setItem("bcc-recent-searches::a", '["theirs"]');
    stillLoading();
    render(<Recents />);
    expect(shown()).toEqual([]);
    expect(screen.queryByText("theirs")).toBeNull();
  });

  it("writes nothing while the session is still loading", () => {
    stillLoading();
    render(<Recents />);
    act(() => {
      screen.getByTestId("push").click();
    });
    // Visible in this tab — the person typed it — but filed nowhere, so it
    // cannot surface under another viewer or in a shared bucket.
    const keys = Object.keys(window.localStorage);
    expect(keys.filter((k) => k.startsWith("bcc-recent-searches"))).toEqual([]);
  });

  it("is UNKNOWN, not anonymous, for a session that is loading", () => {
    stillLoading();
    render(<ScopeReadout />);
    expect(screen.getByTestId("scope")).toHaveTextContent("(unknown)");
  });

  it("is UNKNOWN for an authenticated session with no usable id", () => {
    // A malformed or partially populated session must not fall through to
    // the anonymous bucket, which an account would then share.
    sessionState.data = { user: {} };
    sessionState.status = "authenticated";
    render(<ScopeReadout />);
    expect(screen.getByTestId("scope")).toHaveTextContent("(unknown)");
  });
});

describe("state seeded from storage follows the scope, not the mount", () => {
  /** Reads the reconciled seen-set the tour engine consults. */
  function SeenReadout() {
    const { hasSeen } = useToursSeen();
    return <div data-testid="seen">{hasSeen("home-feed") ? "yes" : "no"}</div>;
  }

  function seenTree() {
    return (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SeenReadout />
      </QueryClientProvider>
    );
  }

  it("re-seeds the tour seen-set when the viewer becomes known", () => {
    // Seeding once at mount read nothing, because at mount there is no
    // scope — so a tour the viewer had already finished played again.
    addLocalSeen("a", "home-feed");
    const view = render(seenTree());
    expect(screen.getByTestId("seen")).toHaveTextContent("no");
    signedIn("a");
    view.rerender(seenTree());
    expect(screen.getByTestId("seen")).toHaveTextContent("yes");
  });

  it("holds the seen-set through a blip rather than emptying it", () => {
    // An unavailable scope is not an empty seen-set. Wiping it here would
    // make `hasSeen` false mid-session and re-arm a tour the viewer has
    // already finished — and the tour would then be offered against a
    // scope nothing can name.
    addLocalSeen("a", "home-feed");
    signedIn("a");
    const view = render(seenTree());
    expect(screen.getByTestId("seen")).toHaveTextContent("yes");

    noteEstablishedViewer("a");
    signedOut();
    view.rerender(seenTree());

    expect(screen.getByTestId("seen")).toHaveTextContent("yes");
  });

  it("does not carry one viewer's seen-set into the next viewer's", () => {
    addLocalSeen("a", "home-feed");
    signedIn("a");
    const view = render(seenTree());
    expect(screen.getByTestId("seen")).toHaveTextContent("yes");
    signedIn("b");
    view.rerender(seenTree());
    expect(screen.getByTestId("seen")).toHaveTextContent("no");
  });

  it("offers the resume prompt to its owner once the viewer is known", () => {
    setOnboardingProgress("a", "notifications");
    const view = render(<ResumeOnboardingPrompt />);
    expect(screen.queryByRole("button", { name: /resume onboarding/i })).toBeNull();
    signedIn("a");
    view.rerender(<ResumeOnboardingPrompt />);
    expect(
      screen.getByRole("button", { name: /resume onboarding/i }),
    ).toBeInTheDocument();
  });

  it("does not offer one viewer's unfinished setup to another", () => {
    setOnboardingProgress("a", "notifications");
    signedIn("b");
    render(<ResumeOnboardingPrompt />);
    expect(screen.queryByRole("button", { name: /resume onboarding/i })).toBeNull();
  });
});

describe("legacy unscoped values are deleted, never adopted", () => {
  it("does not hand a legacy value to whoever signs in next", () => {
    window.localStorage.setItem("bcc-recent-searches", '["someone else"]');
    signedIn("a");
    render(<Recents />);
    expect(shown()).toEqual([]);
    expect(screen.queryByText("someone else")).toBeNull();
    expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
    expect(window.localStorage.getItem("bcc-recent-searches::a")).toBeNull();
  });

  it("purges on a DOCUMENT-LOAD arrival, the one an OAuth round trip makes", () => {
    // OAuth sign-in leaves and re-enters the document, so the in-place
    // session-change path in SessionBoundaryBridge never fires: this tab
    // boots straight into "authenticated" with no previous viewer to
    // compare against. The purge therefore hangs off the hook's mount, not
    // off a transition.
    window.localStorage.setItem("bcc-recent-searches", '["previous viewer"]');
    window.localStorage.setItem("bcc.blog.draft.anon", "half a post");
    window.sessionStorage.setItem("bcc.communities.dismissed", "1");
    signedIn("a");
    render(<ScopeReadout />);
    expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
    expect(window.localStorage.getItem("bcc.blog.draft.anon")).toBeNull();
    expect(window.sessionStorage.getItem("bcc.communities.dismissed")).toBeNull();
  });

  it("purges for an anonymous visitor too", () => {
    // Nobody has to sign in for the previous viewer's values to be
    // removable: they identify nobody, so there is nothing to wait for.
    window.localStorage.setItem("bcc-tour-seen", '["welcome"]');
    signedOut();
    render(<ScopeReadout />);
    expect(window.localStorage.getItem("bcc-tour-seen")).toBeNull();
  });

  it("leaves device preferences alone", () => {
    window.localStorage.setItem("bcc-theme", "dark");
    window.localStorage.setItem("bcc-sidebar-collapsed", "true");
    signedIn("a");
    render(<ScopeReadout />);
    expect(window.localStorage.getItem("bcc-theme")).toBe("dark");
    expect(window.localStorage.getItem("bcc-sidebar-collapsed")).toBe("true");
  });

  it("leaves one viewer's SCOPED value untouched", () => {
    window.localStorage.setItem("bcc-recent-searches::b", '["theirs"]');
    signedIn("a");
    render(<ScopeReadout />);
    expect(window.localStorage.getItem("bcc-recent-searches::b")).toBe('["theirs"]');
  });
});
