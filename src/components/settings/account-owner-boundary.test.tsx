/**
 * The Account tab is owner-only. This file proves the half that was not
 * already proven.
 *
 * ## What already existed
 *
 * `profile-tabs-ia.test.tsx` (PR #158) runs the REAL `ProfileTabs`
 * resolver over all eight settings keys, `account` among them, and
 * asserts a signed-in non-owner deep-linking `?tab=account` falls back to
 * the visitor default. Resolver gating is therefore already covered, and
 * the first hardening pass was wrong to report it missing.
 *
 * That file stubs every panel, though — deliberately, because it is about
 * routing. So it cannot see WHAT the Account panel would render, and this
 * slice changed exactly that: a new six-section IA, a Danger Zone, and a
 * `viewerEmail` prop threaded down from the server session.
 *
 * ## What this file adds
 *
 *   1. CONTENT non-leakage, with the REAL panel reachable through the
 *      REAL resolver — `next/dynamic` resolves its loader here instead of
 *      being replaced by a marker, and the section components use their
 *      real hooks against a stubbed network. The new section labels, the
 *      destructive controls and the address are all proven absent from a
 *      non-owner's DOM, and present in an owner's.
 *   2. The ANONYMOUS case — `isSignedIn` false.
 *   3. The `viewerEmail` gate at the one expression that decides it,
 *      since a server component cannot be rendered in jsdom.
 *   4. The panel invents no address when handed the non-owner value.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Suspense, lazy, type ComponentType } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const searchParamsState = vi.hoisted(() => ({ tab: null as string | null }));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams(searchParamsState.tab === null ? "" : `tab=${searchParamsState.tab}`),
  usePathname: () => "/u/dana",
}));

/**
 * The panel under test is code-split, so a marker stub would hide the very
 * thing this file exists to inspect. This mock RESOLVES the loader.
 * `next/dynamic`'s loaders here return the component itself (`.then(m =>
 * m.X)`), so it is rewrapped for React.lazy.
 */
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    const Lazy = lazy(async () => ({
      default: (await loader()) as ComponentType<Record<string, unknown>>,
    }));
    const Wrapped = (props: Record<string, unknown>) => (
      <Suspense fallback={<div data-testid="lazy-loading" />}>
        <Lazy {...props} />
      </Suspense>
    );
    Wrapped.displayName = "DynamicResolved";
    return Wrapped;
  },
}));

// Wallet linking reaches for injected providers; the stance panel is a
// separate network surface. Neither is part of the ownership boundary.
vi.mock("@/lib/wallet/linkFlow", () => ({
  runLinkFlow: vi.fn(),
  humanizeLinkError: () => "Wallet unavailable.",
}));
vi.mock("@/components/onchain/CollectionStancePanel", () => ({
  CollectionStancePanel: () => null,
}));

const { ProfileTabs } = await import("@/components/profile/ProfileTabs");
const { AccountSettingsPanel } = await import(
  "@/components/profile/panels/settings/AccountSettingsPanel"
);

const OWNER_EMAIL = "owner-secret-address@example.com";

/** Every string the new Account IA introduces. None may reach a visitor. */
const OWNER_ONLY_STRINGS = [
  "SIGN-IN",
  "VERIFIED ACCOUNTS",
  "SECURITY ACTIVITY",
  "SECURITY ACTIONS",
  "DANGER ZONE",
  "Delete account",
  "Delete my account",
  "Sign out everywhere",
  "Change email",
  "Change password",
  "These settings are private",
];

const PROFILE = { handle: "dana", display_name: "Dana", user_id: 42, bio: "" } as never;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  // Real hooks, real React Query, no real network. Every Account read
  // therefore settles into its error branch — which is itself worth
  // rendering here: a failed load must not leak either.
  //
  // A RESOLVED 500 rather than a rejected promise: next-auth's logger
  // fires its own POST to /api/auth/_log during these renders, and a
  // rejection there surfaces as an unhandled rejection that has nothing
  // to do with the assertions.
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: "bcc_internal_error", message: "" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  searchParamsState.tab = null;
});

function renderTabs(opts: { isOwner: boolean; isSignedIn?: boolean; tab?: string | null }) {
  searchParamsState.tab = opts.tab ?? null;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProfileTabs
        handle="dana"
        displayName="Dana"
        isOwner={opts.isOwner}
        targetUserId={42}
        reputationScore={50}
        profile={PROFILE}
        reliability={undefined}
        isSignedIn={opts.isSignedIn ?? true}
        viewerHandle={opts.isOwner ? "dana" : "someone-else"}
        receivedCount={0}
        writtenCount={0}
        // What the server would forward. The gate producing it is pinned
        // separately below.
        viewerEmail={opts.isOwner ? OWNER_EMAIL : ""}
      />
    </QueryClientProvider>,
  );
}

/** The panel is lazy; wait for the Suspense fallback to be replaced. */
async function settled() {
  await waitFor(() => expect(screen.queryByTestId("lazy-loading")).toBeNull());
}

// ─────────────────────────────────────────────────────────────────────
// 1. The REAL panel, mounted through the REAL resolver
// ─────────────────────────────────────────────────────────────────────

describe("an owner does reach the new Account IA", () => {
  it("renders the section headings — the positive control", async () => {
    renderTabs({ isOwner: true, tab: "account" });
    await settled();
    for (const label of [
      "SIGN-IN", "VERIFIED ACCOUNTS", "SECURITY ACTIVITY", "SECURITY ACTIONS", "DANGER ZONE",
    ]) {
      expect(await screen.findByText(label), `${label} missing for the owner`).toBeDefined();
    }
    expect(screen.getByRole("button", { name: /Delete my account/ })).toBeDefined();
  });

  it("is given the address to edit", async () => {
    renderTabs({ isOwner: true, tab: "account" });
    await settled();
    await waitFor(() => expect(document.body.innerHTML).toContain(OWNER_EMAIL));
  });
});

describe("a signed-in NON-owner reaches none of it", () => {
  it("mounts no Account content on ?tab=account", async () => {
    renderTabs({ isOwner: false, tab: "account" });
    await settled();
    const body = document.body.textContent ?? "";
    for (const s of OWNER_ONLY_STRINGS) {
      expect(body, `"${s}" leaked to a non-owner`).not.toContain(s);
    }
  });

  it("exposes no destructive control", async () => {
    renderTabs({ isOwner: false, tab: "account" });
    await settled();
    for (const name of [/Delete my account/, /Sign out everywhere/, /^Unlink$/]) {
      expect(screen.queryByRole("button", { name }), `${name} rendered`).toBeNull();
    }
  });

  it("never receives the owner's address in the DOM", async () => {
    renderTabs({ isOwner: false, tab: "account" });
    await settled();
    expect(document.body.innerHTML).not.toContain(OWNER_EMAIL);
    expect(document.body.innerHTML).not.toContain("owner-secret-address");
  });
});

describe("an ANONYMOUS viewer reaches none of it either", () => {
  it("is not offered the owner tab", async () => {
    renderTabs({ isOwner: false, isSignedIn: false });
    await settled();
    expect(screen.queryByRole("tab", { name: /My Profile/ })).toBeNull();
  });

  it("mounts no Account content on a deep link", async () => {
    renderTabs({ isOwner: false, isSignedIn: false, tab: "account" });
    await settled();
    const body = document.body.textContent ?? "";
    for (const s of OWNER_ONLY_STRINGS) {
      expect(body, `"${s}" leaked to an anonymous viewer`).not.toContain(s);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Where viewerEmail comes from
// ─────────────────────────────────────────────────────────────────────

describe("viewerEmail is gated at its source", () => {
  const PAGE = readFileSync(
    resolve(process.cwd(), "src/app/(main)/(app)/u/[handle]/page.tsx"),
    "utf-8",
  );

  it("the page forwards an address ONLY when the viewer is the owner", () => {
    // A server component cannot be rendered in jsdom, so the single
    // expression that decides is pinned. What is done with the value is
    // covered behaviourally above.
    expect(PAGE).toMatch(/viewerEmail=\{[\s\S]{0,200}isOwner[\s\S]{0,140}:\s*""/);
  });

  it("the session address is read in exactly one place", () => {
    const hits = [...PAGE.matchAll(/session\?\.user\??\.email/g)];
    expect(hits, "email referenced outside the gated expression").toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. The panel invents nothing
// ─────────────────────────────────────────────────────────────────────

describe("the panel does not fabricate owner data", () => {
  it('renders an empty email field when handed the non-owner ""', async () => {
    // Defence in depth behind the resolver: were the panel ever mounted
    // without an address, it must show none rather than a placeholder that
    // reads like one.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AccountSettingsPanel currentEmail="" />
      </QueryClientProvider>,
    );
    await screen.findByText("DANGER ZONE");
    expect(document.body.innerHTML).not.toContain("@example.com");
    const email = document.querySelector('input[type="email"]') as HTMLInputElement | null;
    expect(email?.value ?? "").toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Mutation control
// ─────────────────────────────────────────────────────────────────────

describe("mutation control", () => {
  it("M7: the leak detector fires against an owner's DOM", async () => {
    // Every non-owner assertion above is negative, so they would all pass
    // vacuously if the panel simply never mounted for anyone — including
    // if this file's next/dynamic mock silently failed to resolve. Running
    // the SAME detector over the owner's DOM must find the strings.
    renderTabs({ isOwner: true, tab: "account" });
    await settled();
    await screen.findByText("DANGER ZONE");
    const body = document.body.textContent ?? "";
    const found = OWNER_ONLY_STRINGS.filter((s) => body.includes(s));
    expect(found.length, `owner saw only: ${found.join(", ")}`).toBeGreaterThan(8);
    expect(document.body.innerHTML).toContain(OWNER_EMAIL);
  });
});
