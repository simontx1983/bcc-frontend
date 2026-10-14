/**
 * Viewer-scoped storage: the routing rules, and the migration rule that
 * matters most — legacy unscoped data is deleted, never adopted.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANON_SCOPE,
  LEGACY_UNSCOPED_KEYS,
  purgeLegacyUnscopedKeys,
  resolveViewerScope,
  scopePrefix,
  scopedKey,
} from "@/lib/auth/viewer-scope";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolving a scope", () => {
  it("uses the viewer id when authenticated", () => {
    expect(resolveViewerScope("authenticated", "4242")).toBe("4242");
  });

  it("is ANONYMOUS for a signed-out visitor, not shared", () => {
    // An anonymous person's recent searches must stay out of every
    // account's scope rather than landing in a bucket an account reads.
    expect(resolveViewerScope("unauthenticated", null)).toBe(ANON_SCOPE);
  });

  it("is UNKNOWN while the session is loading", () => {
    // Guessing here would either leak across accounts or misfile data.
    expect(resolveViewerScope("loading", null)).toBeNull();
    expect(resolveViewerScope("loading", "4242")).toBeNull();
  });

  it("is UNKNOWN when authenticated with no usable id", () => {
    // Not anonymous: an authenticated viewer must never fall through to a
    // shared bucket.
    expect(resolveViewerScope("authenticated", null)).toBeNull();
    expect(resolveViewerScope("authenticated", "")).toBeNull();
    expect(resolveViewerScope("authenticated", undefined)).toBeNull();
  });
});

describe("keying", () => {
  it("returns null for an unknown scope, so callers cannot read or write", () => {
    expect(scopedKey("bcc-recent-searches", null)).toBeNull();
  });

  it("separates base from scope unambiguously", () => {
    // `::` because one base already contains `.` and an id could contain
    // `:`; the departure sweep tests `startsWith(base + "::")`.
    expect(scopedKey("bcc-recent-searches", "4242")).toBe(
      "bcc-recent-searches::4242",
    );
    expect(scopePrefix("bcc-recent-searches")).toBe("bcc-recent-searches::");
    expect(
      scopedKey("bcc.communities.dismissed", "4242")?.startsWith(
        scopePrefix("bcc.communities.dismissed"),
      ),
    ).toBe(true);
  });

  it("keeps two viewers' values in distinct keys", () => {
    expect(scopedKey("bcc-tour-seen", "1")).not.toBe(
      scopedKey("bcc-tour-seen", "2"),
    );
  });

  it("does not let one viewer's key be mistaken for another family's", () => {
    // A scope that looks like a longer base must not collide.
    expect(scopedKey("bcc-tour", "seen::4242")).not.toBe(
      scopedKey("bcc-tour-seen", "4242"),
    );
  });
});

describe("legacy unscoped data", () => {
  it("is DELETED, never adopted into the next viewer's scope", () => {
    // The whole point. Renaming `bcc-recent-searches` into the scope of
    // whoever signs in next would hand one person's search history to
    // another — the exact defect this change removes. Losing a tour
    // position is the cheaper error.
    window.localStorage.setItem("bcc-recent-searches", '["acme payroll leak"]');
    window.localStorage.setItem("bcc-tour-seen", '["welcome"]');
    window.sessionStorage.setItem("bcc.communities.dismissed", "1");

    const removed = purgeLegacyUnscopedKeys();

    expect(removed).toBe(3);
    for (const key of LEGACY_UNSCOPED_KEYS) {
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
    // And nothing was created under any scope.
    const all = [
      ...Object.keys(window.localStorage),
      ...Object.keys(window.sessionStorage),
    ];
    expect(all.filter((k) => k.includes("::"))).toEqual([]);
  });

  it("leaves scoped values alone", () => {
    window.localStorage.setItem("bcc-recent-searches::4242", '["mine"]');
    purgeLegacyUnscopedKeys();
    expect(window.localStorage.getItem("bcc-recent-searches::4242")).toBe('["mine"]');
  });

  it("leaves device preferences alone", () => {
    window.localStorage.setItem("bcc-theme", "dark");
    window.localStorage.setItem("bcc-accent", "rust");
    purgeLegacyUnscopedKeys();
    expect(window.localStorage.getItem("bcc-theme")).toBe("dark");
    expect(window.localStorage.getItem("bcc-accent")).toBe("rust");
  });

  it("is safe to call repeatedly and when there is nothing to remove", () => {
    expect(purgeLegacyUnscopedKeys()).toBe(0);
    expect(purgeLegacyUnscopedKeys()).toBe(0);
  });

  it("survives storage that throws", () => {
    // Private modes and blocked site data throw outright. Nothing here is
    // load-bearing enough to fail over.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => purgeLegacyUnscopedKeys()).not.toThrow();
  });
});
