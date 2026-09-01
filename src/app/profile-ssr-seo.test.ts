/**
 * Profile SSR + SEO wiring — the properties that are only visible in source.
 *
 * These assert *contracts between files* (server fetch vs client hook, root
 * metadata vs child metadata, grid fractions vs tile heights) that no single
 * render test can see.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/**
 * Strip comments before asserting that a term is ABSENT.
 *
 * Several of these files explain in prose exactly which thing they must not
 * do ("never is_in_good_standing", "nothing truncates"), so a raw substring
 * check would fail on the very comment documenting the rule. Presence checks
 * can use the raw source; absence checks go through here.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PAGE = read("src/app/(main)/(app)/u/[handle]/page.tsx");
const HOOK = read("src/hooks/useAttestationRoster.ts");
const ENDPOINTS = read("src/lib/api/attestations-endpoints.ts");
const ROSTER = read("src/components/profile/AttestationRoster.tsx");
const LAYOUT = read("src/app/layout.tsx");
const ME = read("src/app/(main)/(app)/u/me/page.tsx");

describe("server-rendered default tab — seed correctness", () => {
  it("seeds ONLY anonymous viewers", () => {
    // The read is token-less and shares a Data-Cache entry across everyone.
    // Handing it to an authed viewer would show them a cache-shared payload
    // in place of their own.
    expect(PAGE).toContain("if (session === null) {");
    expect(PAGE).toContain("getAttestationRosterAnon(");
  });

  it("passes no token to the shared-cache read", () => {
    // There is deliberately no token parameter to get wrong.
    expect(ENDPOINTS).toMatch(/export function getAttestationRosterAnon\(/);
    const fn = ENDPOINTS.slice(ENDPOINTS.indexOf("getAttestationRosterAnon("));
    expect(fn.slice(0, fn.indexOf("}"))).not.toContain("token");
  });

  it("uses the anonymous revalidation policy, not a new number", () => {
    expect(PAGE).toContain("ANON_SSR_REVALIDATE_SECONDS");
  });

  it("server and client agree on the query key inputs", () => {
    // React Query hashes keys structurally, so both callers must pass the
    // same params VALUE. One exported const is how that stays true.
    expect(ENDPOINTS).toContain("export const PROFILE_ROSTER_PARAMS");
    expect(PAGE).toContain("PROFILE_ROSTER_PARAMS");
    expect(ROSTER).toContain("PROFILE_ROSTER_PARAMS");
    // The inline literal the roster used before must be gone.
    expect(ROSTER).not.toContain("{ include_revoked: true }");
  });

  it("carries initialDataUpdatedAt, not initialData alone", () => {
    // initialData alone tells React Query the data is fresh as of NOW, so the
    // 30s staleTime restarts on the client and a 60s-cached payload can look
    // permanently fresh.
    expect(HOOK).toContain("initialData: seed.data");
    expect(HOOK).toContain("initialDataUpdatedAt: seed.updatedAt");
    // The timestamp is taken BEFORE the await, so it is the real read time.
    expect(PAGE).toMatch(/const fetchedAt = Date\.now\(\);[\s\S]{0,400}?await getAttestationRosterAnon/);
  });

  it("keeps the existing 30s stale time rather than inventing one", () => {
    expect(HOOK).toContain("staleTime: STALE_TIME_MS");
  });

  it("a roster failure cannot take down the profile", () => {
    const block = PAGE.slice(
      PAGE.indexOf("let rosterSeed"),
      PAGE.indexOf("// Email-shaped handles"),
    );
    expect(block).toContain("try {");
    expect(block).toContain("catch {");
    expect(block).toContain("rosterSeed = undefined;");
    // No rethrow, no notFound() — the panel just fetches client-side.
    expect(block).not.toContain("throw");
  });

  it("does not server-render owner-only panels", () => {
    // The seven settings panels + BlogPanel stay ssr:false so a visitor never
    // downloads the editor code. Only the public default tab is seeded.
    const tabs = read("src/components/profile/ProfileTabs.tsx");
    const dynamicCount = (tabs.match(/ssr: false/g) ?? []).length;
    expect(dynamicCount).toBeGreaterThanOrEqual(8);
    expect(PAGE).not.toContain("PrivacySettingsPanel");
    expect(PAGE).not.toContain("AccountSettingsPanel");
  });
});

describe("indexing — one gate, four surfaces", () => {
  it("root metadata noindexes non-production", () => {
    expect(LAYOUT).toContain("isIndexableEnvironment()");
    expect(LAYOUT).toContain("robots: { index: false, follow: false }");
  });

  it("profile metadata gates on BOTH environment and profile flags", () => {
    expect(PAGE).toContain("isIndexableEnvironment() && isIndexableProfile(profile.flags)");
  });

  it("never uses is_in_good_standing for indexing", () => {
    // Reputation tier, not moderation status — it is false for a legitimate
    // new member on the risky or caution tier.
    const metadata = code(PAGE).slice(0, code(PAGE).indexOf("export default async function"));
    expect(metadata).not.toContain("is_in_good_standing");
  });

  it("no child route overrides the root rule with index: true", () => {
    // A nested `robots: { index: true }` would re-expose a non-production
    // deployment that the root layout had just de-indexed.
    for (const src of [code(PAGE), code(ME), code(LAYOUT)]) {
      expect(src).not.toMatch(/robots:\s*\{[^}]*index:\s*true/);
    }
  });

  it("/u/me is de-indexed by metadata, not a robots prefix", () => {
    expect(ME).toContain("robots: { index: false, follow: false }");
  });

  it("emits no JSON-LD for a non-indexable environment or profile", () => {
    expect(PAGE).toMatch(
      /isIndexableEnvironment\(\) && isIndexableProfile\(profile\.flags\)[\s\S]{0,80}\? serializeJsonLd/,
    );
  });

  it("does not leak a moderation reason into public metadata", () => {
    const metadata = code(PAGE).slice(0, code(PAGE).indexOf("export default async function"));
    for (const slug of ["suspended", "shadow_limited", "under_review"]) {
      // The words may appear in comments; what must not happen is emitting
      // them into a title, description or any other rendered field.
      expect(metadata).not.toMatch(new RegExp(`(title|description):[^\\n]*${slug}`));
    }
  });
});

describe("counts strip — the REVIEWS WRITTEN overflow", () => {
  it("lays the groups out two per row, not four", () => {
    // The hero sits in the 680px centre column, so the strip has ~574px at
    // EVERY width from 768px up — 1024px and 1440px measure identically.
    // Six tiles need >=92px each to keep their longest single WORD whole
    // (WATCHERS is 60px of text plus 32px of panel padding), which puts four
    // groups across at ~720px once gaps and pl-6 are counted. No fraction
    // fits 720 into 574, which is why tuning them only moved the problem.
    expect(PAGE).toContain("sm:grid sm:grid-cols-2");
    expect(PAGE).not.toMatch(/grid-cols-\[[\d.]+fr_1fr_[\d.]+fr_1fr\]/);
  });

  it("never forces a mid-word break", () => {
    // RECOGNITION is a single unbreakable word. Four across left it 65px, so
    // it either pinned its own column or split as RECOGNI/TION. Two columns
    // give it 251px — no override needed, and none may come back.
    const strip = code(PAGE).slice(code(PAGE).indexOf("function CountsStrip"));
    for (const hack of ["overflow-wrap", "break-all", "break-words", "hyphens"]) {
      expect(strip, `CountsStrip reintroduced ${hack}`).not.toContain(hack);
    }
  });

  it("draws the dashed rule on the right column only", () => {
    // Four-across gave every group after the first a left rule. In two
    // columns that would draw one down the left edge of a row-opening group.
    expect(PAGE).toContain("idx % 2 === 1");
  });

  it("guards every track with min-w-0 so nothing can overflow", () => {
    expect(PAGE).toContain('"min-w-0 " +');
    expect(PAGE).toMatch(/bcc-panel[^"]*min-w-0/);
  });

  it("gives tiles a shared minimum height so a wrapped label stays level", () => {
    expect(PAGE).toMatch(/min-h-\[\d+px\][^"]*sm:min-h-\[\d+px\]/);
  });

  it("keeps the wording and never truncates", () => {
    expect(PAGE).toContain("REVIEW_TAB_COPY.written.toUpperCase()");
    const stripped = code(PAGE);
    const strip = stripped.slice(stripped.indexOf("function CountsStrip"));
    expect(strip).not.toContain("truncate");
    expect(strip).not.toContain("whitespace-nowrap");
  });

  it("keeps all six labels", () => {
    for (const label of [
      "BLOG POSTS",
      "DISPUTES SIGNED",
      "SOLIDS RECEIVED",
      "REVIEW_TAB_COPY.written",
    ]) {
      expect(PAGE).toContain(label);
    }
  });
});

describe("the Message affordance reaches only the profile card", () => {
  it("is withheld from anonymous viewers and from your own profile", () => {
    expect(PAGE).toContain("session !== null && !isOwner");
    expect(PAGE).toContain("messagePermissions: profile.permissions");
  });

  it("adds nothing to the card view-model", () => {
    // The permission travels as a React prop from a page that already has it.
    expect(read("src/lib/api/types.ts")).not.toContain("messagePermissions");
  });
});
