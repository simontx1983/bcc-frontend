/**
 * Indexing gate — the environment matrix and the per-profile flag rules.
 *
 * These two functions decide whether a deployment and a profile may enter a
 * search index, and every other SEO surface (robots.txt, root metadata, page
 * metadata, JSON-LD) reads them. A false positive here publishes staging, or
 * a suspended account, to Google.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadIndexing() {
  vi.resetModules();
  return import("@/lib/seo/indexing");
}

/** Set the env the way a given deployment would. */
function setEnv(vercelEnv: string | undefined, nextAuthUrl: string | undefined) {
  if (vercelEnv === undefined) delete process.env["VERCEL_ENV"];
  else process.env["VERCEL_ENV"] = vercelEnv;

  if (nextAuthUrl === undefined) delete process.env["NEXTAUTH_URL"];
  else process.env["NEXTAUTH_URL"] = nextAuthUrl;

  // appOrigin() consults these after NEXTAUTH_URL; clear so they can't leak in.
  delete process.env["VERCEL_BRANCH_URL"];
  delete process.env["VERCEL_URL"];
  delete process.env["VERCEL_PROJECT_PRODUCTION_URL"];
}

beforeEach(() => {
  setEnv(undefined, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...ORIGINAL_ENV };
});

describe("isIndexableEnvironment — both conditions are required", () => {
  it("allows the real production host on a production build", async () => {
    setEnv("production", "https://bluecollarcrypto.io");
    const { isIndexableEnvironment } = await loadIndexing();
    expect(isIndexableEnvironment()).toBe(true);
  });

  it("REJECTS staging even when it builds as production", async () => {
    // The whole reason the host check exists. A staging Vercel project, or a
    // staging domain on a production deployment, reports VERCEL_ENV=production.
    setEnv("production", "https://stage.bluecollarcrypto.io");
    const { isIndexableEnvironment } = await loadIndexing();
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("rejects www — it is not canonical today", async () => {
    setEnv("production", "https://www.bluecollarcrypto.io");
    const { isIndexableEnvironment } = await loadIndexing();
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("rejects preview deployments", async () => {
    setEnv("preview", "https://bcc-frontend-git-feat.vercel.app");
    const { isIndexableEnvironment } = await loadIndexing();
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("rejects a vercel.app project URL even on production", async () => {
    setEnv("production", "https://bcc-frontend-rho.vercel.app");
    const { isIndexableEnvironment } = await loadIndexing();
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("rejects local development", async () => {
    setEnv(undefined, "http://localhost:3000");
    const { isIndexableEnvironment } = await loadIndexing();
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("rejects a missing VERCEL_ENV even on the canonical host", async () => {
    setEnv(undefined, "https://bluecollarcrypto.io");
    const { isIndexableEnvironment } = await loadIndexing();
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("fails closed when the origin cannot be resolved", async () => {
    // appOrigin() throws for a production build with nothing to go on. A
    // misconfigured deploy must not be indexable, and must not crash.
    setEnv("production", undefined);
    // NODE_ENV is a read-only property on the typed process.env; stubEnv is
    // the supported way to force appOrigin() down its throwing branch.
    vi.stubEnv("NODE_ENV", "production");
    const { isIndexableEnvironment } = await loadIndexing();
    expect(() => isIndexableEnvironment()).not.toThrow();
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("fails closed on a malformed origin", async () => {
    setEnv("production", "not-a-url");
    const { isIndexableEnvironment } = await loadIndexing();
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("rejects any other hostname by default", async () => {
    for (const host of [
      "https://bluecollarcrypto.io.evil.com",
      "https://cms.bluecollarcrypto.io",
      "https://bluecollarcrypto.com",
    ]) {
      setEnv("production", host);
      const { isIndexableEnvironment } = await loadIndexing();
      expect(isIndexableEnvironment(), host).toBe(false);
    }
  });
});

describe("isIndexableProfile — explicit moderation flags only", () => {
  it("indexes an ordinary profile", async () => {
    const { isIndexableProfile } = await loadIndexing();
    expect(isIndexableProfile([])).toBe(true);
  });

  it.each(["suspended", "hidden", "under_review", "shadow_limited"])(
    "de-indexes a profile flagged %s",
    async (flag) => {
      const { isIndexableProfile } = await loadIndexing();
      expect(isIndexableProfile([flag])).toBe(false);
    },
  );

  it("de-indexes when a moderation flag rides alongside others", async () => {
    const { isIndexableProfile } = await loadIndexing();
    expect(isIndexableProfile(["something_else", "hidden"])).toBe(false);
  });

  it("does NOT de-index for an unrecognised flag", async () => {
    // Only the four documented slugs are moderation signals. A future
    // additive flag must not silently remove people from search.
    const { isIndexableProfile } = await loadIndexing();
    expect(isIndexableProfile(["mentor_opt_in"])).toBe(true);
  });

  it("fails closed on a missing flags array", async () => {
    const { isIndexableProfile } = await loadIndexing();
    expect(isIndexableProfile(undefined)).toBe(false);
  });

  it("never consults reputation tier", async () => {
    // is_in_good_standing is in_array(tier, ['neutral','trusted','elite']) —
    // reputation, not moderation. A new member on the risky or caution tier
    // is `false` there, and must still be indexable. The helper takes only
    // `flags`, so tier CANNOT reach it; this pins that signature.
    const { isIndexableProfile } = await loadIndexing();
    expect(isIndexableProfile.length).toBe(1);
    expect(isIndexableProfile([])).toBe(true);
  });
});
