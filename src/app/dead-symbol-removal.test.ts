/**
 * Dead-TypeScript-symbol cleanup — the removal set, pinned so it cannot
 * creep back.
 *
 * 13 unreferenced exports were deleted, plus a two-symbol cascade they
 * were holding alive, plus the `rehype-pretty-code` dependency. The
 * revalidation that authorised this walked 5,830 files repo-wide
 * (TS/TSX, JS, JSON, MD, PHP, HTML, YAML, SQL, SH), comment-stripped and
 * token-exact, and found each symbol referenced only by its own
 * declaration.
 *
 * ## Three findings that shaped what was deleted, and what was not
 *
 *   - **`getUnreadCount` is a cross-language name collision.** Seven
 *     references existed, but the PHP ones are a service method
 *     (`$this->service()->getUnreadCount($viewerId)` in
 *     `MessagesEndpoint.php`, `NotificationsEndpoint.php`,
 *     `BadgesService.php`) that shares nothing with the TS client but a
 *     name. This guard therefore scans `bcc-frontend/src` ONLY — a
 *     repo-wide assertion would fail on unrelated, living PHP.
 *
 *   - **`getGroupMembers` was a duplicate, not merely unused.**
 *     `useGroupMembers` reaches the same endpoint through
 *     `bccFetchAsClient` directly. Deleting the wrapper removes a second
 *     way to call one route; it does not remove the capability.
 *
 *   - **The reaffirm chain was three levels deep.** Deleting
 *     `useReaffirmAttestation` orphaned `reaffirmAttestation`, which
 *     orphaned `AttestationReaffirmResponse`. All three are gone. This
 *     was an owner-approved expansion beyond the audited 13, recorded
 *     here so the next reader knows it was deliberate.
 *
 * ## What was NOT deleted, and is asserted present below
 *
 * Two response types looked orphaned because their *endpoint file* no
 * longer imports them — but both are still consumed by hooks, so only
 * the import specifiers went. A future cleanup that reads "unused
 * import" as "unused type" would break the build; these assertions say
 * so first.
 *
 * `STATUS_POST_MAX_LENGTH` survives its two deleted aliases
 * (`PHOTO_CAPTION_MAX_LENGTH`, `GIF_CAPTION_MAX_LENGTH`). The server
 * still enforces 500 chars on captions and `docs/api-contract-v1.md`
 * still documents it — the contract is unchanged; only an unused
 * TypeScript mirror of it is gone.
 *
 * ## Why the scan proves itself before it concludes
 *
 * A regex that matches nothing reports universal absence and looks like
 * a pass. So this file asserts a non-zero file count, asserts a floor on
 * it, and requires the matcher to find control symbols that ARE present
 * before any absence claim is trusted.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");

/** This file necessarily names every deleted symbol; it must not scan itself. */
const SELF = "dead-symbol-removal.test.ts";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name) && entry.name !== SELF) {
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC);

/** Comments stripped: a symbol named only in prose is not a reference. */
const SOURCES = FILES.map((f) => ({
  path: f.slice(SRC.length + 1).replace(/\\/g, "/"),
  code: readFileSync(f, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/.*$/gm, ""),
}));

/**
 * Token-exact. `\b` treats `-` as a boundary, which is how the dead-CSS
 * slice nearly kept four live selectors; the same trap applies to `$`
 * and `_` in identifiers.
 */
const refs = (name: string) =>
  SOURCES.filter((s) => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(s.code)).map(
    (s) => s.path,
  );

/** The 13 audited symbols. */
const DELETED_AUDITED: readonly string[] = [
  "GIF_CAPTION_MAX_LENGTH",
  "OAuthCallbackHandler",
  "PHOTO_CAPTION_MAX_LENGTH",
  "UNREAD_MESSAGE_COUNT_QUERY_KEY",
  "ViewsIcon",
  "VouchedByIcon",
  "formatJoinedAge",
  "getGroupMembers",
  "getUnreadCount",
  "getUnreadMessageCount",
  "markConversationRead",
  "revokePushSubscription",
  "useReaffirmAttestation",
];

/** The cascade the 13 were holding alive. */
const DELETED_CASCADE: readonly string[] = [
  "AttestationReaffirmResponse",
  "reaffirmAttestation",
];

const DELETED = [...DELETED_AUDITED, ...DELETED_CASCADE];

describe("dead symbols — the scan is honest before it concludes", () => {
  it("read a non-zero number of real source files", () => {
    expect(FILES.length).toBeGreaterThan(0);
    expect(FILES.length).toBeGreaterThan(400); // 560 at the time of removal
    expect(SOURCES.some((s) => s.code.includes("export"))).toBe(true);
  });

  it("the matcher finds control symbols that ARE present", () => {
    // If these ever come back empty the matcher is broken, and every
    // absence assertion below is worthless.
    expect(refs("STATUS_POST_MAX_LENGTH").length).toBeGreaterThan(0);
    expect(refs("castAttestation").length).toBeGreaterThan(0);
    expect(refs("WatchIcon").length).toBeGreaterThan(0);
  });

  it("comment stripping does not blank the corpus", () => {
    const nonEmpty = SOURCES.filter((s) => s.code.trim().length > 0);
    expect(nonEmpty.length).toBe(SOURCES.length);
  });

  it("the removal set is 15 unique names", () => {
    expect(DELETED).toHaveLength(15);
    expect(new Set(DELETED).size).toBe(15);
  });
});

describe("dead symbols — all 15 stay gone", () => {
  it("none has come back anywhere in src", () => {
    const back = DELETED.filter((s) => refs(s).length > 0);
    expect(back, `resurrected: ${back.join(", ")}`).toEqual([]);
  });

  for (const symbol of DELETED) {
    it(`${symbol} absent`, () => {
      expect(refs(symbol)).toEqual([]);
    });
  }
});

describe("dead symbols — the survivors were not collateral damage", () => {
  it("both response types the endpoint files stopped importing are still live", () => {
    // Deleted from `messages-endpoints` / `notifications-endpoints`
    // imports only. The interfaces, and their hook consumers, remain.
    expect(refs("UnreadMessageCountResponse")).toContain("hooks/useUnreadMessageCount.ts");
    expect(refs("NotificationsUnreadCountResponse")).toContain("hooks/useNotifications.ts");
    expect(refs("GroupMembersResponse")).toContain("hooks/useGroupMembers.ts");
  });

  it("the caption cap survives as the one canonical constant", () => {
    expect(refs("STATUS_POST_MAX_LENGTH").length).toBeGreaterThan(0);
  });

  it("the icon registry keeps its four live exports", () => {
    const registry = SOURCES.find((s) => s.path === "components/icons/registry.ts");
    expect(registry).toBeDefined();
    const exported = [...(registry?.code ?? "").matchAll(/as (\w+Icon)\b/g)].map((m) => m[1]);
    expect(new Set(exported)).toEqual(
      new Set(["WatchIcon", "VouchIcon", "JoinIcon", "FlipIcon"]),
    );
  });

  it("the surviving attestation verbs still have clients", () => {
    expect(refs("castAttestation").length).toBeGreaterThan(0);
    expect(refs("revokeAttestation").length).toBeGreaterThan(0);
    expect(refs("getAttestationRoster").length).toBeGreaterThan(0);
  });

  it("the surviving push verbs still have clients", () => {
    expect(refs("getVapidPublicKey").length).toBeGreaterThan(0);
    expect(refs("registerPushSubscription").length).toBeGreaterThan(0);
  });
});

describe("rehype-pretty-code is gone from the dependency tree", () => {
  const pkg = readFileSync(resolve(process.cwd(), "package.json"), "utf-8");

  it("is not a declared dependency", () => {
    expect(pkg).not.toContain("rehype-pretty-code");
  });

  it("the package.json read actually found dependencies", () => {
    // Same anti-empty-room rule: prove the file was read before trusting
    // an absence claim about it.
    expect(pkg).toContain("react-markdown");
    expect(pkg).toContain("shiki");
  });

  it("no source file imports it", () => {
    expect(refs("rehype")).toEqual([]);
  });

  it("the real highlighter is still wired", () => {
    // Shiki runs through a module-level singleton in the `pre` override,
    // NOT a rehype plugin — react-markdown 10.x calls the pipeline via
    // `runSync`, which a Shiki rehype plugin cannot satisfy.
    expect(refs("highlightCode").length).toBeGreaterThan(0);
    expect(refs("shikiReady").length).toBeGreaterThan(0);
  });
});
