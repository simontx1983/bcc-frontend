/**
 * /signup/complete-profile — the OAuth provider token is a credential.
 *
 * NextAuth's callback (lib/auth.ts completeProfileUrl) hands it over in the
 * URL FRAGMENT, `#pt=`: a fragment is never sent to a server (no request
 * log), never appears in a Referer, and is not part of the page segment key
 * Next keeps in history.state. The page reads it once at mount, holds it in
 * state and removes it from this history entry with replaceState.
 *
 * The server render cannot see a fragment, so until mount the page shows a
 * "reading" card — never the "Session expired" card.
 *
 * Not covered by any of this: the browser's global History list records
 * the URL as first visited, fragment included. The short backend token
 * life (bcc-trust #711) is the control for that.
 */

import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
  serverEnv: { BCC_OAUTH_BRIDGE_SECRET: "test-secret" },
}));
vi.mock("@/lib/analytics/posthog", () => ({
  noteSignupCompleted: vi.fn(),
  signupMethodForProvider: () => "google",
}));

const h = vi.hoisted(() => ({
  oauthComplete: vi.fn(),
  signIn: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/api/auth-endpoints", () => ({
  oauthComplete: (...a: unknown[]) => h.oauthComplete(...a),
}));
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => h.signIn(...a) }));

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const CompleteProfilePage = (await import("@/app/(auth)/signup/complete-profile/page")).default;
const { completeProfileUrl } = await import("@/lib/auth");

const TOKEN = "provider-token-abc";

/** Put the page at `path` (as the browser would after the redirect), and mirror its query in the hook. */
function arriveAt(path: string) {
  window.history.replaceState(null, "", path);
  // Snapshot the keys: deleting inside forEach skips every other entry.
  for (const k of [...searchParams.keys()]) searchParams.delete(k);
  new URL(path, "https://x.test").searchParams.forEach((v, k) => searchParams.set(k, v));
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

// ─────────────────────────────────────────────────────────────────────

describe("the redirect lib/auth.ts builds", () => {
  it("never puts the token in the query; it rides in the fragment", () => {
    const url = new URL(
      completeProfileUrl({ providerToken: TOKEN, email: "jo@example.com", provider: "google" }),
      "https://bluecollarcrypto.io",
    );
    expect(url.pathname).toBe("/signup/complete-profile");
    expect(url.searchParams.has("pt")).toBe(false);
    expect(url.search).not.toContain(TOKEN);
    expect(url.searchParams.get("email")).toBe("jo@example.com");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(new URLSearchParams(url.hash.slice(1)).get("pt")).toBe(TOKEN);
  });

  it("omits an empty email and an unknown provider, and encodes the token", () => {
    const raw = completeProfileUrl({ providerToken: "a b&c", email: "", provider: "github" });
    expect(raw).toBe("/signup/complete-profile#pt=a+b%26c");
  });
});

describe("the page takes the token from the fragment", () => {
  it("scrubs the fragment after mount, in place (no new history entry), keeping the query", async () => {
    arriveAt(completeProfileUrl({ providerToken: TOKEN, email: "jo@example.com", provider: "google" }));
    const lengthBefore = window.history.length;
    render(<CompleteProfilePage />);

    expect(await screen.findByRole("button", { name: "Join the floor" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.pathname).toBe("/signup/complete-profile");
    const left = new URLSearchParams(window.location.search);
    expect(left.get("email")).toBe("jo@example.com");
    expect(left.get("provider")).toBe("google");
    expect(window.history.length).toBe(lengthBefore);
  });

  it("the submit carries the token read at mount", async () => {
    arriveAt(completeProfileUrl({ providerToken: TOKEN, email: "jo@example.com", provider: "google" }));
    h.oauthComplete.mockRejectedValue(new Error("stop here"));
    render(<CompleteProfilePage />);

    fireEvent.change(await screen.findByLabelText("Handle"), { target: { value: "jo-welds" } });
    fireEvent.click(screen.getByRole("button", { name: "Join the floor" }));
    await waitFor(() => expect(h.oauthComplete).toHaveBeenCalledTimes(1));
    expect(h.oauthComplete.mock.calls[0]?.[0]).toMatchObject({ provider_token: TOKEN, handle: "jo-welds" });
  });

  it("takes it exactly once under StrictMode (effects run twice in development)", async () => {
    arriveAt(completeProfileUrl({ providerToken: TOKEN, email: "jo@example.com", provider: "google" }));
    h.oauthComplete.mockRejectedValue(new Error("stop here"));
    render(
      <StrictMode>
        <CompleteProfilePage />
      </StrictMode>,
    );

    fireEvent.change(await screen.findByLabelText("Handle"), { target: { value: "jo-welds" } });
    expect(screen.queryByText("Session expired")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Join the floor" }));
    await waitFor(() => expect(h.oauthComplete).toHaveBeenCalledTimes(1));
    expect(h.oauthComplete.mock.calls[0]?.[0]).toMatchObject({ provider_token: TOKEN });
  });
});

describe("no 'Session expired' flash", () => {
  it("the server render (first paint) is the reading card", () => {
    // What the browser paints before hydration: the server cannot see #pt.
    searchParams.set("email", "jo@example.com");
    const html = renderToString(<CompleteProfilePage />);
    expect(html).toContain("Just a moment");
    expect(html).not.toContain("Session expired");
    expect(html).not.toContain("Join the floor");
  });

  it("with a token, 'Session expired' never renders on the way to the form", async () => {
    arriveAt(completeProfileUrl({ providerToken: TOKEN, email: "jo@example.com", provider: "google" }));
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ""));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    render(<CompleteProfilePage />);
    await screen.findByRole("button", { name: "Join the floor" });
    observer.disconnect();

    expect(seen.some((t) => t.includes("Session expired"))).toBe(false);
  });

  it("with no token anywhere, the expired card shows after mount, and nothing is rewritten", async () => {
    arriveAt("/signup/complete-profile?email=jo%40example.com");
    const spy = vi.spyOn(window.history, "replaceState");
    render(<CompleteProfilePage />);

    expect(await screen.findByText("Session expired")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("deploy skew: a redirect from before the fragment", () => {
  it("still accepts ?pt= once and scrubs it from the query", async () => {
    arriveAt(`/signup/complete-profile?pt=${TOKEN}&email=jo%40example.com`);
    h.oauthComplete.mockRejectedValue(new Error("stop here"));
    render(<CompleteProfilePage />);

    fireEvent.change(await screen.findByLabelText("Handle"), { target: { value: "jo-welds" } });
    expect(window.location.search).not.toContain("pt=");
    expect(new URLSearchParams(window.location.search).get("email")).toBe("jo@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Join the floor" }));
    await waitFor(() => expect(h.oauthComplete).toHaveBeenCalledTimes(1));
    expect(h.oauthComplete.mock.calls[0]?.[0]).toMatchObject({ provider_token: TOKEN });
  });
});
