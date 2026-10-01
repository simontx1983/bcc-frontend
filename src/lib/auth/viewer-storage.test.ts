/**
 * Closed inventory over browser storage.
 *
 * Two lists, two opposite failure modes: a viewer key that escapes into
 * the preserved set is a privacy leak; a device preference that lands in
 * the cleared set makes sign-out feel like a factory reset. Both are
 * pinned, and the derived test below is what stops a NEW key joining
 * neither list unnoticed.
 */

import { execFileSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEVICE_SCOPED_STORAGE_KEYS,
  VIEWER_SCOPED_STORAGE_KEYS,
  clearViewerStorage,
} from "@/lib/auth/viewer-storage";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clearViewerStorage", () => {
  it("removes every viewer-scoped key", () => {
    for (const key of VIEWER_SCOPED_STORAGE_KEYS) {
      window.localStorage.setItem(key, "viewer-a");
    }
    clearViewerStorage();
    for (const key of VIEWER_SCOPED_STORAGE_KEYS) {
      expect(window.localStorage.getItem(key), key).toBeNull();
    }
  });

  it("preserves device preferences", () => {
    for (const key of DEVICE_SCOPED_STORAGE_KEYS) {
      window.localStorage.setItem(key, "keep-me");
    }
    clearViewerStorage();
    for (const key of DEVICE_SCOPED_STORAGE_KEYS) {
      expect(window.localStorage.getItem(key), key).toBe("keep-me");
    }
  });

  it("clears the previous viewer's search history specifically", () => {
    // Called out because search terms are content, and they render
    // verbatim in the global search dropdown's RECENT section.
    window.localStorage.setItem(
      "bcc-recent-searches",
      JSON.stringify(["private thing i searched"]),
    );
    clearViewerStorage();
    expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
  });

  it("clears sessionStorage as well as localStorage", () => {
    window.sessionStorage.setItem("bcc-tour-seen", "x");
    clearViewerStorage();
    expect(window.sessionStorage.getItem("bcc-tour-seen")).toBeNull();
  });

  it("does not throw when storage access is blocked", () => {
    // Private mode / blocked site data: the accessor itself throws.
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => clearViewerStorage()).not.toThrow();
  });

  it("the two lists are disjoint", () => {
    const overlap = VIEWER_SCOPED_STORAGE_KEYS.filter((k) =>
      DEVICE_SCOPED_STORAGE_KEYS.includes(k),
    );
    expect(overlap).toEqual([]);
  });
});

describe("no storage key escapes classification", () => {
  it("every bcc-* key written anywhere in src is in exactly one list", () => {
    // Derived, not pinned: greps the real source so a new key added
    // tomorrow fails here rather than silently defaulting to "kept".
    const out = execFileSync(
      "git",
      [
        "grep",
        "-hoE",
        "(localStorage|sessionStorage)\\.setItem\\(\\s*[\"'`][^\"'`]+",
        "--",
        "src",
      ],
      { encoding: "utf-8", cwd: process.cwd() },
    );

    const keys = new Set(
      out
        .split(/\r?\n/)
        .map((line) => line.replace(/.*\(\s*["'`]/, "").trim())
        .filter((k) => k !== "" && !k.includes("${")),
    );

    expect(keys.size, "grep found no storage writes — pattern is broken").toBeGreaterThan(2);

    const classified = new Set<string>([
      ...VIEWER_SCOPED_STORAGE_KEYS,
      ...DEVICE_SCOPED_STORAGE_KEYS,
    ]);

    // Keys written under a non-bcc namespace are third-party//framework
    // and out of scope; everything we own must be classified.
    const unclassified = [...keys].filter(
      (k) => k.startsWith("bcc") && !classified.has(k),
    );

    expect(
      unclassified,
      `unclassified bcc storage key(s) — add to VIEWER_SCOPED_STORAGE_KEYS ` +
        `or DEVICE_SCOPED_STORAGE_KEYS in lib/auth/viewer-storage.ts: ` +
        unclassified.join(", "),
    ).toEqual([]);
  });
});
