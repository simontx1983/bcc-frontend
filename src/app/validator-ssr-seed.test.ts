/**
 * Validator SSR seed — the cache and privacy contract, which is only
 * visible in source.
 *
 * The Backing tab is the landing tab, and the roster fetches client-side
 * while rendering its empty-state copy whenever `data` is undefined. So a
 * validator WITH attestations told every visitor "No attestations on file
 * yet" for the whole round-trip, and that is what crawlers indexed.
 *
 * The fix seeds React Query from the server — but the read is token-less and
 * lands in a SHARED 60s Data-Cache entry, so the dangerous failure mode is
 * handing that shared payload to a signed-in viewer. These assertions pin
 * the boundary. Sibling of profile-ssr-seo.test.ts, which does the same for
 * /u/[handle].
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/**
 * Strip comments before asserting a term is ABSENT — this page explains in
 * prose what it must not do, so a raw substring check would trip on the very
 * comment documenting the rule. Presence checks use the raw source.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PAGE = read("src/app/(main)/(app)/v/[slug]/page.tsx");
const PROFILE = read("src/components/entity/EntityProfile.tsx");
const ROSTER = read("src/components/profile/AttestationRoster.tsx");
const HOOK = read("src/hooks/useAttestationRoster.ts");
const ENDPOINTS = read("src/lib/api/attestations-endpoints.ts");

/** The seed block, isolated so the assertions cannot drift onto other code. */
const SEED_BLOCK = PAGE.slice(
  PAGE.indexOf("let rosterSeed"),
  PAGE.indexOf("return ("),
);

describe("authenticated data cannot enter the shared anonymous cache", () => {
  it("seeds ONLY anonymous viewers", () => {
    expect(SEED_BLOCK).toContain("if (session === null) {");
  });

  it("reads through the token-less anonymous endpoint", () => {
    expect(SEED_BLOCK).toContain("getAttestationRosterAnon(");
    // The page must not reach for the authed reader on this path.
    expect(code(SEED_BLOCK)).not.toContain("getAttestationRoster(");
    expect(code(SEED_BLOCK)).not.toContain("token");
  });

  it("the anonymous endpoint still has no token parameter to get wrong", () => {
    const fn = ENDPOINTS.slice(
      ENDPOINTS.indexOf("export function getAttestationRosterAnon("),
    );
    expect(fn.slice(0, fn.indexOf("}"))).not.toContain("token");
  });

  it("uses the shared anonymous revalidation policy, not a new number", () => {
    expect(SEED_BLOCK).toContain("ANON_SSR_REVALIDATE_SECONDS");
    // No bespoke window smuggled in beside it.
    expect(SEED_BLOCK).not.toMatch(/revalidate:\s*\d+/);
  });

  it("the card fetch keeps its own authed/anon split", () => {
    // Untouched by this change: an authed card read must stay uncached.
    expect(PAGE).toContain(
      "token === null ? { revalidate: ANON_SSR_REVALIDATE_SECONDS } : undefined",
    );
  });
});

describe("an unseeded loading state must not claim there are no attestations", () => {
  it("hands the seed to the roster so the landing tab renders real rows", () => {
    expect(PROFILE).toContain("seed={rosterSeed}");
    expect(PAGE).toContain("rosterSeed !== undefined ? { rosterSeed } : {}");
  });

  it("server and client agree on the query key inputs", () => {
    // React Query hashes keys structurally, so a params mismatch would make
    // the seed silently inert — the exact bug this asserts against.
    expect(ENDPOINTS).toContain("export const PROFILE_ROSTER_PARAMS");
    expect(SEED_BLOCK).toContain("PROFILE_ROSTER_PARAMS");
    expect(ROSTER).toContain("PROFILE_ROSTER_PARAMS");
  });

  it("seeds the same target the roster asks for", () => {
    // validator_card + card.id, matching cardKindToAttestationTargetKind.
    expect(SEED_BLOCK).toContain('"validator_card"');
    expect(SEED_BLOCK).toContain("card.id");
    expect(PROFILE).toContain('case "validator":');
    expect(PROFILE).toContain('return "validator_card";');
  });

  it("carries initialDataUpdatedAt, not initialData alone", () => {
    expect(HOOK).toContain("initialData: seed.data");
    expect(HOOK).toContain("initialDataUpdatedAt: seed.updatedAt");
    // Timestamp taken BEFORE the await, so it is the real read time and the
    // 30s staleTime is measured from when the data was actually read.
    expect(SEED_BLOCK).toMatch(
      /const fetchedAt = Date\.now\(\);[\s\S]{0,400}?await getAttestationRosterAnon/,
    );
  });
});

describe("a roster failure cannot take down the validator page", () => {
  it("swallows the seed read and falls back to the client fetch", () => {
    expect(SEED_BLOCK).toContain("try {");
    expect(SEED_BLOCK).toContain("catch {");
    expect(SEED_BLOCK).toContain("rosterSeed = undefined;");
  });

  it("neither rethrows nor 404s from the seed path", () => {
    expect(code(SEED_BLOCK)).not.toContain("throw");
    expect(code(SEED_BLOCK)).not.toContain("notFound(");
  });
});

describe("the seed is additive — unseeded callers are unchanged", () => {
  it("keeps rosterSeed optional on the shared entity surface", () => {
    expect(PROFILE).toContain("rosterSeed?: RosterSeed | undefined;");
  });

  it("leaves the project and creator routes seeding nothing", () => {
    // Scope was the validator page. These two share EntityProfile, so the
    // prop must stay optional rather than required — if a later change makes
    // it required, this fails instead of breaking those routes.
    for (const p of [
      "src/app/(main)/(app)/p/[slug]/page.tsx",
      "src/app/(main)/(app)/c/[slug]/page.tsx",
    ]) {
      expect(read(p)).not.toContain("rosterSeed");
    }
  });
});
