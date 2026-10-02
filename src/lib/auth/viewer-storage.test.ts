/**
 * Closed inventory over browser storage.
 *
 * Two opposite failure modes: a viewer key that escapes into the preserved
 * set is a privacy leak; a device preference in the cleared set makes
 * sign-out feel like a factory reset. Both are pinned.
 *
 * ## Why the derived guard is written the way it is
 *
 * The first version grepped only LITERAL keys — `setItem("bcc-…")`. Almost
 * every key here is written through a `const`, so it resolved 5 keys out of
 * 12 write sites, two of those only because test files happened to write
 * them literally, and its `size > 2` tripwire was satisfied by those test
 * writes alone. Green while covering nothing. It missed:
 *
 *   bcc-tour-progress / bcc-tour-dismissed  (constants, sessionStorage)
 *   bcc.blog.draft.<handle>                 (template — unpublished body text)
 *   bcc:fp_reported:<userId>                (template — discloses a user id)
 *
 * The guard below resolves constants and template prefixes, and carries
 * PLANTED POSITIVES so a reader can see it still discriminates.
 */

import { execFileSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEVICE_SCOPED_STORAGE_KEYS,
  VIEWER_SCOPED_STORAGE_KEYS,
  VIEWER_SCOPED_STORAGE_PREFIXES,
  clearViewerStorage,
} from "@/lib/auth/viewer-storage";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// Behaviour
// ─────────────────────────────────────────────────────────────────────

describe("clearViewerStorage", () => {
  it("removes every viewer-scoped key from BOTH stores", () => {
    for (const key of VIEWER_SCOPED_STORAGE_KEYS) {
      window.localStorage.setItem(key, "viewer-a");
      window.sessionStorage.setItem(key, "viewer-a");
    }
    expect(clearViewerStorage()).toBe("cleared");
    for (const key of VIEWER_SCOPED_STORAGE_KEYS) {
      expect(window.localStorage.getItem(key), key).toBeNull();
      expect(window.sessionStorage.getItem(key), key).toBeNull();
    }
  });

  it("removes the viewer's unpublished blog draft, whatever the handle", () => {
    // bcc.blog.draft.<handle> holds the body of an unpublished post. An
    // exact-key list structurally cannot reach it.
    window.localStorage.setItem("bcc.blog.draft.viewer-a", "my unpublished body");
    window.localStorage.setItem("bcc.blog.draft.someone-else", "another body");
    expect(clearViewerStorage()).toBe("cleared");
    expect(window.localStorage.getItem("bcc.blog.draft.viewer-a")).toBeNull();
    expect(window.localStorage.getItem("bcc.blog.draft.someone-else")).toBeNull();
  });

  it("removes the fingerprint marker, which has the user id IN the key", () => {
    window.sessionStorage.setItem("bcc:fp_reported:4242", "1");
    expect(clearViewerStorage()).toBe("cleared");
    expect(window.sessionStorage.getItem("bcc:fp_reported:4242")).toBeNull();
  });

  it("removes partial tour state, not just the completed-tour list", () => {
    window.sessionStorage.setItem("bcc-tour-progress", '{"home-feed":2}');
    window.sessionStorage.setItem("bcc-tour-dismissed", '["home-feed"]');
    expect(clearViewerStorage()).toBe("cleared");
    expect(window.sessionStorage.getItem("bcc-tour-progress")).toBeNull();
    expect(window.sessionStorage.getItem("bcc-tour-dismissed")).toBeNull();
  });

  it("clears the previous viewer's search history specifically", () => {
    // Search terms are content, rendered verbatim in the global search
    // dropdown's RECENT section.
    window.localStorage.setItem(
      "bcc-recent-searches",
      JSON.stringify(["private thing i searched"]),
    );
    expect(clearViewerStorage()).toBe("cleared");
    expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
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

  it("leaves unrelated third-party keys alone", () => {
    window.localStorage.setItem("some-other-app", "x");
    clearViewerStorage();
    expect(window.localStorage.getItem("some-other-app")).toBe("x");
  });

  it("reports PARTIAL rather than claiming deletion when removal throws", () => {
    window.localStorage.setItem("bcc-recent-searches", "x");
    // jsdom's Storage is Proxy-backed: spying on the INSTANCE defines a
    // storage entry named "removeItem" instead of replacing the method, so
    // the override silently does nothing. Spy on the prototype.
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(clearViewerStorage()).toBe("partial");
  });

  it("reports PARTIAL when a key survives removal", () => {
    window.localStorage.setItem("bcc-recent-searches", "x");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      /* silently no-op, as a quota or policy quirk can */
    });
    expect(clearViewerStorage()).toBe("partial");
  });

  it("does not throw when a whole store is unreachable", () => {
    vi.spyOn(Object, "keys").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearViewerStorage()).not.toThrow();
  });

  it("the two classifications are disjoint", () => {
    const overlap = VIEWER_SCOPED_STORAGE_KEYS.filter((k) =>
      DEVICE_SCOPED_STORAGE_KEYS.includes(k),
    );
    expect(overlap).toEqual([]);
    const prefixHitsDevice = DEVICE_SCOPED_STORAGE_KEYS.filter((k) =>
      VIEWER_SCOPED_STORAGE_PREFIXES.some((p) => k.startsWith(p)),
    );
    expect(prefixHitsDevice).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The derived guard
// ─────────────────────────────────────────────────────────────────────

function grepLines(pattern: string): string[] {
  return execFileSync("git", ["grep", "-hoE", pattern, "--", "src"], {
    encoding: "utf-8",
    cwd: process.cwd(),
  })
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/**
 * Every `bcc*` storage key written anywhere in src, however it is named.
 *
 * Resolution is deliberately LINKED: a template-literal local counts only
 * if that identifier is actually handed to `setItem`. An earlier draft
 * swept every `bcc`-prefixed template assignment in src and reported
 * `bcc-action-error-` and `bcc-post-policy-error-` as unclassified storage
 * keys — both are DOM element ids in GroupActionButton and
 * GroupPostPolicyToggle. Over-reporting trains people to pad the
 * allowlists, which is its own failure mode.
 *
 * Known limitation: identifiers resolve by NAME across files, because
 * `autosaveKey` is declared in BlogComposer and passed as a prop to
 * BodyEditor, which is what writes it. Two different locals sharing a name
 * would be conflated. Acceptable for a guard whose job is to notice a NEW
 * key, and stated so nobody reads more into it.
 */
function discoverStorageKeys(): { keys: Set<string>; sites: number } {
  const writes = grepLines("(localStorage|sessionStorage)\\.setItem\\([^,]+");

  const consts = new Map<string, string>();
  for (const line of grepLines(
    "(const|let) [A-Za-z_][A-Za-z0-9_]* = [\"`]bcc[^\"`]*",
  )) {
    const lit = /(?:const|let) ([A-Za-z_][A-Za-z0-9_]*) = "(bcc[^"]*)"/.exec(line);
    if (lit?.[1] !== undefined && lit[2] !== undefined) {
      consts.set(lit[1], lit[2]);
      continue;
    }
    const tpl = /(?:const|let) ([A-Za-z_][A-Za-z0-9_]*) = `(bcc[^`$]*)/.exec(line);
    if (tpl?.[1] !== undefined && tpl[2] !== undefined) {
      consts.set(tpl[1], tpl[2]);
    }
  }

  const keys = new Set<string>();
  for (const w of writes) {
    const arg = w.replace(/^.*setItem\(\s*/, "");

    const lit = /^["'`](bcc[^"'`]*)["'`]$/.exec(arg);
    if (lit?.[1] !== undefined) {
      keys.add(lit[1]);
      continue;
    }
    const tpl = /^`(bcc[^`$]*)\$\{/.exec(arg);
    if (tpl?.[1] !== undefined) {
      keys.add(tpl[1]);
      continue;
    }
    const ident = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(arg);
    if (ident?.[1] !== undefined) {
      const resolved = consts.get(ident[1]);
      if (resolved !== undefined) {
        keys.add(resolved);
      }
    }
  }

  return { keys, sites: writes.length };
}

function isClassified(key: string): boolean {
  if (VIEWER_SCOPED_STORAGE_KEYS.includes(key)) return true;
  if (DEVICE_SCOPED_STORAGE_KEYS.includes(key)) return true;
  // A discovered template prefix is classified when it IS a declared
  // prefix, or sits on either side of one.
  return VIEWER_SCOPED_STORAGE_PREFIXES.some(
    (p) => key === p || key.startsWith(p) || p.startsWith(key),
  );
}

describe("no storage key escapes classification", () => {
  it("scans a meaningful number of real write sites", () => {
    const { sites, keys } = discoverStorageKeys();
    // The literal-only predecessor resolved 5 keys from 12 sites and still
    // passed. These floors come from the real counts, so a regression in
    // the SCANNER — not just in the lists — fails here.
    expect(sites, "scanner found almost no setItem sites").toBeGreaterThanOrEqual(10);
    expect(keys.size, "scanner resolved almost no keys").toBeGreaterThanOrEqual(8);
  });

  it("every bcc* key written in src is classified", () => {
    const { keys } = discoverStorageKeys();
    const unclassified = [...keys].filter((k) => !isClassified(k));
    expect(
      unclassified,
      "unclassified bcc storage key(s) — add to VIEWER_SCOPED_STORAGE_KEYS, " +
        "VIEWER_SCOPED_STORAGE_PREFIXES or DEVICE_SCOPED_STORAGE_KEYS in " +
        "lib/auth/viewer-storage.ts: " + unclassified.join(", "),
    ).toEqual([]);
  });

  it("PLANTED POSITIVE: an unclassified literal key is caught", () => {
    expect(isClassified("bcc-some-brand-new-key")).toBe(false);
  });

  it("PLANTED POSITIVE: an unclassified dynamic family is caught", () => {
    expect(isClassified("bcc.secret.draft.")).toBe(false);
  });

  it("PLANTED POSITIVE: the scanner resolves a CONSTANT-named write", () => {
    // bcc-tour-progress is `sessionStorage.setItem(PROGRESS_KEY, …)` and was
    // invisible to the literal-only predecessor.
    const { keys } = discoverStorageKeys();
    expect(keys.has("bcc-tour-progress")).toBe(true);
  });

  it("PLANTED POSITIVE: the scanner resolves TEMPLATE-named writes", () => {
    const { keys } = discoverStorageKeys();
    expect([...keys].some((k) => k.startsWith("bcc.blog.draft"))).toBe(true);
    expect([...keys].some((k) => k.startsWith("bcc:fp_reported"))).toBe(true);
  });

  it("does NOT mistake a DOM element id for a storage key", () => {
    // `bcc-action-error-${groupId}` is an aria-describedby target, never
    // written to storage. The linked resolution is what excludes it.
    const { keys } = discoverStorageKeys();
    expect([...keys].some((k) => k.startsWith("bcc-action-error"))).toBe(false);
    expect([...keys].some((k) => k.startsWith("bcc-post-policy-error"))).toBe(false);
  });
});
