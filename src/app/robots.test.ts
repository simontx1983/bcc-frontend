/**
 * robots.txt — the non-production posture, and the prefix-matching traps.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadRobots() {
  vi.resetModules();
  const mod = await import("@/app/robots");
  return mod.default();
}

function setEnv(vercelEnv: string | undefined, nextAuthUrl: string) {
  if (vercelEnv === undefined) delete process.env["VERCEL_ENV"];
  else process.env["VERCEL_ENV"] = vercelEnv;
  process.env["NEXTAUTH_URL"] = nextAuthUrl;
  delete process.env["VERCEL_BRANCH_URL"];
  delete process.env["VERCEL_URL"];
  delete process.env["VERCEL_PROJECT_PRODUCTION_URL"];
}

/** Disallow entries as a flat array, whatever shape the rule used. */
function disallowOf(result: Awaited<ReturnType<typeof loadRobots>>): string[] {
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  return rules.flatMap((r) => {
    const d = r?.disallow;
    if (d === undefined) return [];
    return Array.isArray(d) ? d : [d];
  });
}

beforeEach(() => setEnv("production", "https://bluecollarcrypto.io"));
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("non-production stays CRAWLABLE", () => {
  it.each([
    ["staging", "production", "https://stage.bluecollarcrypto.io"],
    ["preview", "preview", "https://bcc-git-feat.vercel.app"],
    ["local", undefined, "http://localhost:3000"],
  ])("does not blanket-disallow on %s", async (_label, env, url) => {
    setEnv(env, url);
    const result = await loadRobots();

    // Deliberately NOT `Disallow: /`. No X-Robots-Tag header exists in this
    // scope, so the only de-indexing signal is the root layout's noindex meta
    // tag — and a crawler blocked by robots.txt never fetches the page, so it
    // would never see it. Blocking here would make de-indexing LESS reliable.
    expect(disallowOf(result)).not.toContain("/");
  });

  it("never advertises a sitemap (the profile sitemap is blocked)", async () => {
    for (const [env, url] of [
      ["production", "https://bluecollarcrypto.io"],
      ["production", "https://stage.bluecollarcrypto.io"],
      ["preview", "https://x.vercel.app"],
    ] as const) {
      setEnv(env, url);
      const result = await loadRobots();
      expect(result).not.toHaveProperty("sitemap");
    }
  });
});

describe("production disallow list", () => {
  it("covers the non-public surfaces", async () => {
    const d = disallowOf(await loadRobots());
    expect(d).toEqual(
      expect.arrayContaining(["/api", "/admin", "/messages", "/me/", "/settings"]),
    );
  });

  it("uses /me/ with a trailing slash so it cannot match /members", async () => {
    const d = disallowOf(await loadRobots());
    // robots.txt matches by PREFIX: a bare "/me" would also match "/members"
    // and block the entire member directory.
    expect(d).not.toContain("/me");
    expect(d).toContain("/me/");
    expect("/members".startsWith("/me/")).toBe(false);
  });

  it("never uses a /u/ prefix — it would match real handles", async () => {
    const d = disallowOf(await loadRobots());
    // "/u/me" would also match "/u/mega", "/u/melissa", etc. That route is
    // de-indexed by page metadata instead.
    for (const entry of d) {
      expect(entry.startsWith("/u/"), `dangerous prefix: ${entry}`).toBe(false);
    }
  });

  it("does not disallow public content", async () => {
    const d = disallowOf(await loadRobots());
    for (const publicPath of ["/", "/u", "/members", "/communities", "/validators"]) {
      expect(d, `blocked public path ${publicPath}`).not.toContain(publicPath);
    }
  });
});
