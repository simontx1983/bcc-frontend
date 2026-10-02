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
  LEGACY_UNSCOPED_KEYS,
  LEGACY_UNSCOPED_PREFIXES,
  scopedKey,
} from "@/lib/auth/viewer-scope";
import {
  DEVICE_SCOPED_STORAGE_KEYS,
  VIEWER_SCOPED_STORAGE_KEYS,
  VIEWER_SCOPED_STORAGE_PREFIXES,
  clearCrossViewerStorage,
  clearViewerStorage,
} from "@/lib/auth/viewer-storage";

/** The viewer who is leaving, in every test below. */
const LEAVING = "4242";
/** Someone else who also uses this browser. */
const OTHER = "9001";

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
  it("removes every viewer-scoped key from BOTH stores, scoped and legacy", () => {
    for (const base of VIEWER_SCOPED_STORAGE_KEYS) {
      const scoped = scopedKey(base, LEAVING) as string;
      for (const key of [base, scoped]) {
        window.localStorage.setItem(key, "viewer-a");
        window.sessionStorage.setItem(key, "viewer-a");
      }
    }
    expect(clearViewerStorage(LEAVING)).toBe("cleared");
    for (const base of VIEWER_SCOPED_STORAGE_KEYS) {
      for (const key of [base, scopedKey(base, LEAVING) as string]) {
        expect(window.localStorage.getItem(key), key).toBeNull();
        expect(window.sessionStorage.getItem(key), key).toBeNull();
      }
    }
  });

  it("leaves ANOTHER viewer's scoped values alone", () => {
    // Two accounts share a browser. Signing one out is not permission to
    // delete the other's half-finished onboarding or their tour position.
    for (const base of VIEWER_SCOPED_STORAGE_KEYS) {
      window.localStorage.setItem(scopedKey(base, OTHER) as string, "theirs");
      window.localStorage.setItem(scopedKey(base, LEAVING) as string, "mine");
    }
    expect(clearViewerStorage(LEAVING)).toBe("cleared");
    for (const base of VIEWER_SCOPED_STORAGE_KEYS) {
      expect(
        window.localStorage.getItem(scopedKey(base, OTHER) as string),
        base,
      ).toBe("theirs");
      expect(
        window.localStorage.getItem(scopedKey(base, LEAVING) as string),
        base,
      ).toBeNull();
    }
  });

  it("removes only the unattributable keys when the departing viewer is unknown", () => {
    // A teardown with no committed viewer. Guessing a scope would delete a
    // bystander's data, so only what belongs to nobody goes.
    window.localStorage.setItem("bcc-recent-searches", "legacy");
    window.localStorage.setItem(scopedKey("bcc-recent-searches", OTHER) as string, "theirs");
    expect(clearViewerStorage(null)).toBe("cleared");
    expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
    expect(
      window.localStorage.getItem(scopedKey("bcc-recent-searches", OTHER) as string),
    ).toBe("theirs");
  });

  it("removes the viewer's unpublished blog draft, whatever the handle", () => {
    // bcc.blog.draft.<handle> holds the body of an unpublished post. An
    // exact-key list structurally cannot reach it.
    window.localStorage.setItem("bcc.blog.draft.viewer-a", "my unpublished body");
    window.localStorage.setItem("bcc.blog.draft.someone-else", "another body");
    expect(clearViewerStorage(LEAVING)).toBe("cleared");
    expect(window.localStorage.getItem("bcc.blog.draft.viewer-a")).toBeNull();
    expect(window.localStorage.getItem("bcc.blog.draft.someone-else")).toBeNull();
  });

  it("removes the fingerprint marker, which has the user id IN the key", () => {
    window.sessionStorage.setItem("bcc:fp_reported:4242", "1");
    expect(clearViewerStorage(LEAVING)).toBe("cleared");
    expect(window.sessionStorage.getItem("bcc:fp_reported:4242")).toBeNull();
  });

  it("removes partial tour state, not just the completed-tour list", () => {
    window.sessionStorage.setItem("bcc-tour-progress", '{"home-feed":2}');
    window.sessionStorage.setItem("bcc-tour-dismissed", '["home-feed"]');
    expect(clearViewerStorage(LEAVING)).toBe("cleared");
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
    expect(clearViewerStorage(LEAVING)).toBe("cleared");
    expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
  });

  it("preserves device preferences", () => {
    for (const key of DEVICE_SCOPED_STORAGE_KEYS) {
      window.localStorage.setItem(key, "keep-me");
    }
    clearViewerStorage(LEAVING);
    for (const key of DEVICE_SCOPED_STORAGE_KEYS) {
      expect(window.localStorage.getItem(key), key).toBe("keep-me");
    }
  });

  it("leaves unrelated third-party keys alone", () => {
    window.localStorage.setItem("some-other-app", "x");
    clearViewerStorage(LEAVING);
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
    expect(clearViewerStorage(LEAVING)).toBe("partial");
  });

  it("reports PARTIAL when a key survives removal", () => {
    window.localStorage.setItem("bcc-recent-searches", "x");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      /* silently no-op, as a quota or policy quirk can */
    });
    expect(clearViewerStorage(LEAVING)).toBe("partial");
  });

  it("does not throw when a whole store is unreachable", () => {
    vi.spyOn(Object, "keys").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearViewerStorage(LEAVING)).not.toThrow();
  });

  it("removes a LEGACY unscoped value as well as the scoped one", () => {
    // Someone who signs out on the upgrade build should not leave the
    // pre-upgrade copy of their search history behind.
    window.localStorage.setItem("bcc-recent-searches", '["legacy"]');
    expect(clearViewerStorage(LEAVING)).toBe("cleared");
    expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
  });

  it("every LEGACY family is also a departure family", () => {
    // The departure sweep reaches a legacy name because the family base IS
    // that name — there is no separate legacy clause to keep in step. This
    // is what makes that safe: a legacy family added to viewer-scope but not
    // classified here would otherwise survive sign-out silently.
    const missing = LEGACY_UNSCOPED_KEYS.filter(
      (k) => !VIEWER_SCOPED_STORAGE_KEYS.includes(k),
    );
    expect(
      missing,
      "legacy key(s) not classified in VIEWER_SCOPED_STORAGE_KEYS: " + missing.join(", "),
    ).toEqual([]);
    const missingPrefixes = LEGACY_UNSCOPED_PREFIXES.filter(
      (p) => !VIEWER_SCOPED_STORAGE_PREFIXES.includes(p),
    );
    expect(
      missingPrefixes,
      "legacy prefix(es) not classified in VIEWER_SCOPED_STORAGE_PREFIXES: " +
        missingPrefixes.join(", "),
    ).toEqual([]);
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

describe("clearCrossViewerStorage (viewer arrival)", () => {
  it("deletes the legacy unscoped values an older version wrote", () => {
    window.localStorage.setItem("bcc-recent-searches", '["acme payroll leak"]');
    window.sessionStorage.setItem("bcc.communities.dismissed", "1");
    window.localStorage.setItem("bcc.blog.draft.anon", "half a post");
    expect(clearCrossViewerStorage()).toBe("cleared");
    expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
    expect(window.sessionStorage.getItem("bcc.communities.dismissed")).toBeNull();
    expect(window.localStorage.getItem("bcc.blog.draft.anon")).toBeNull();
  });

  it("keeps the ARRIVING viewer's own scoped state", () => {
    // This is the behaviour change scoping earns. The old arrival sweep
    // deleted a fixed list of keys outright, which destroyed the resume
    // point of someone who had simply signed back in — there is no server
    // mirror for onboarding progress, so it was gone for good.
    const mine = scopedKey("bcc-onboarding-progress", LEAVING) as string;
    window.localStorage.setItem(mine, '{"step":"chains","updatedAt":1}');
    expect(clearCrossViewerStorage()).toBe("cleared");
    expect(window.localStorage.getItem(mine)).toBe('{"step":"chains","updatedAt":1}');
  });

  it("keeps another viewer's scoped state too — nothing reads across scopes", () => {
    const theirs = scopedKey("bcc-recent-searches", OTHER) as string;
    window.localStorage.setItem(theirs, '["theirs"]');
    clearCrossViewerStorage();
    // Not displayed to anyone else (the reader only ever resolves its own
    // key) and not ours to delete on someone else's arrival.
    expect(window.localStorage.getItem(theirs)).toBe('["theirs"]');
  });

  it("leaves device preferences alone", () => {
    for (const key of DEVICE_SCOPED_STORAGE_KEYS) {
      window.localStorage.setItem(key, "keep-me");
    }
    clearCrossViewerStorage();
    for (const key of DEVICE_SCOPED_STORAGE_KEYS) {
      expect(window.localStorage.getItem(key), key).toBe("keep-me");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// The derived guard
// ─────────────────────────────────────────────────────────────────────

function grepLines(pattern: string): string[] {
  // Test files are excluded: they write fixture keys (`bcc-tour`, deliberate
  // collision probes) that are not families the app stores, and an inventory
  // guard that reports fixtures trains people to pad the allowlists.
  return execFileSync(
    "git",
    ["grep", "-hoE", pattern, "--", "src", ":!*.test.ts", ":!*.test.tsx"],
    {
      encoding: "utf-8",
      cwd: process.cwd(),
    },
  )
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
 *
 * ## Why `scopedKey(…)` call sites count as write sites
 *
 * Since viewer scoping, most writes are `store.setItem(key, …)` where `key`
 * came from `scopedKey(BASE, scope)` — so the literal at the `setItem` call
 * is a local named `key`, resolvable in a dozen files to a dozen different
 * families. Following that by name would conflate them and quietly shrink
 * the inventory to one entry. The family BASE is what matters, and every
 * scoped family names it at a `scopedKey(…)` call, so those are scanned
 * directly. Unscoped families (theme, sidebar, the push row id, the
 * fingerprint marker) are still found at their `setItem`.
 */
function discoverStorageKeys(): { keys: Set<string>; sites: number } {
  const writes = grepLines("(localStorage|sessionStorage)\\.setItem\\([^,]+");
  const scopedCalls = grepLines("scopedKey\\([^,)]+");

  // One name can resolve to SEVERAL values: `PROGRESS_KEY` is
  // `bcc-tour-progress` in lib/tour/storage and `bcc-onboarding-progress` in
  // lib/onboarding/storage. A single-valued map silently kept whichever came
  // last and dropped the other family from the inventory, so collisions
  // over-report instead — a name that resolves to two keys contributes both.
  const consts = new Map<string, string[]>();
  const addConst = (name: string, value: string): void => {
    const existing = consts.get(name);
    if (existing === undefined) {
      consts.set(name, [value]);
    } else if (!existing.includes(value)) {
      existing.push(value);
    }
  };
  for (const line of grepLines(
    "(const|let) [A-Za-z_][A-Za-z0-9_]* = [\"`]bcc[^\"`]*",
  )) {
    // No closing quote in these patterns: `git grep -o` stops the match at
    // the character class, so the captured line never contains it. Requiring
    // one matched nothing, which left every CONSTANT-named key unresolved —
    // and the guard still looked green because test fixtures happened to
    // write some of those keys literally.
    const lit = /(?:const|let) ([A-Za-z_][A-Za-z0-9_]*) = "(bcc[^"]*)/.exec(line);
    if (lit?.[1] !== undefined && lit[2] !== undefined) {
      addConst(lit[1], lit[2]);
      continue;
    }
    const tpl = /(?:const|let) ([A-Za-z_][A-Za-z0-9_]*) = `(bcc[^`$]*)/.exec(line);
    if (tpl?.[1] !== undefined && tpl[2] !== undefined) {
      addConst(tpl[1], tpl[2]);
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
      for (const resolved of consts.get(ident[1]) ?? []) {
        keys.add(resolved);
      }
    }
  }

  for (const call of scopedCalls) {
    const arg = call.replace(/^scopedKey\(\s*/, "");
    const lit = /^["'`](bcc[^"'`]*)["'`]?/.exec(arg);
    if (lit?.[1] !== undefined) {
      keys.add(lit[1]);
      continue;
    }
    const ident = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(arg);
    if (ident?.[1] !== undefined) {
      for (const resolved of consts.get(ident[1]) ?? []) {
        keys.add(resolved);
      }
    }
  }

  return { keys, sites: writes.length + scopedCalls.length };
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
    // passed. These floors come from the real counts (34 sites, 14 keys from
    // NON-test sources), so a regression in the SCANNER — not just in the
    // lists — fails here.
    expect(sites, "scanner found almost no write sites").toBeGreaterThanOrEqual(25);
    expect(keys.size, "scanner resolved almost no keys").toBeGreaterThanOrEqual(13);
  });

  it("PLANTED POSITIVE: resolves a scoped family through its base constant", () => {
    // `scopedKey(SEEN_KEY, scope)` in lib/tour/storage — the only place the
    // family is named, now that the setItem argument is a local.
    const { keys } = discoverStorageKeys();
    expect(keys.has("bcc-tour-seen")).toBe(true);
  });

  it("PLANTED POSITIVE: a name resolving to two families contributes both", () => {
    // `PROGRESS_KEY` is declared twice with different values. Keeping one
    // dropped a whole family from the inventory.
    const { keys } = discoverStorageKeys();
    expect(keys.has("bcc-tour-progress")).toBe(true);
    expect(keys.has("bcc-onboarding-progress")).toBe(true);
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
