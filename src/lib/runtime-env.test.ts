/**
 * The production gate behind /onboarding?preview=1.
 *
 * `?preview=1` skips the "already onboarded → /" redirect. It shipped
 * unrestricted, so any member could re-enter setup from the URL bar — a
 * correctness gate switchable by query param, in production.
 *
 * Two things are pinned here: the environment predicate itself (a real
 * unit test), and the fact that the page actually CONSULTS it. The second
 * is a source guard because the page is an async server component that
 * reads `getServerSession` and the network — but it carries a mutation
 * control, so it cannot pass vacuously.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { allowsDeveloperAffordances, isProductionRuntime } from "@/lib/runtime-env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isProductionRuntime", () => {
  it("is true only for a Vercel production deployment", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isProductionRuntime()).toBe(true);
  });

  it("is false on preview deployments", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isProductionRuntime()).toBe(false);
  });

  it("is false in local development", () => {
    vi.stubEnv("VERCEL_ENV", "development");
    expect(isProductionRuntime()).toBe(false);
  });

  it("is false when VERCEL_ENV is absent (plain `next dev`)", () => {
    vi.stubEnv("VERCEL_ENV", "");
    expect(isProductionRuntime()).toBe(false);
  });
});

describe("allowsDeveloperAffordances — the preview bypass predicate", () => {
  it("REFUSES the bypass in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(allowsDeveloperAffordances()).toBe(false);
  });

  it("permits it on Vercel preview deployments", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(allowsDeveloperAffordances()).toBe(true);
  });

  it("permits it on a Vercel development environment", () => {
    vi.stubEnv("VERCEL_ENV", "development");
    expect(allowsDeveloperAffordances()).toBe(true);
  });

  it("permits it under `next dev` — no VERCEL_ENV, NODE_ENV=development", () => {
    vi.stubEnv("VERCEL_ENV", undefined as unknown as string);
    vi.stubEnv("NODE_ENV", "development");
    expect(allowsDeveloperAffordances()).toBe(true);
  });

  // ── The fail-closed half. Each of these would have returned TRUE under the
  //    original `!isProductionRuntime()` implementation, which is why the
  //    predicate now identifies non-production POSITIVELY.
  describe("fails closed when the environment is not positively non-production", () => {
    it("refuses a self-hosted production build with no VERCEL_ENV", () => {
      vi.stubEnv("VERCEL_ENV", undefined as unknown as string);
      vi.stubEnv("NODE_ENV", "production");
      expect(allowsDeveloperAffordances()).toBe(false);
    });

    it("refuses an empty VERCEL_ENV", () => {
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("NODE_ENV", "production");
      expect(allowsDeveloperAffordances()).toBe(false);
    });

    it("refuses an unrecognised or future VERCEL_ENV value", () => {
      for (const value of ["Production", "prod", "staging", "PREVIEW", "  preview  ", "1"]) {
        vi.stubEnv("VERCEL_ENV", value);
        vi.stubEnv("NODE_ENV", "production");
        expect(allowsDeveloperAffordances(), `VERCEL_ENV=${value}`).toBe(false);
      }
    });

    it("refuses a malformed NODE_ENV when VERCEL_ENV is absent", () => {
      vi.stubEnv("VERCEL_ENV", undefined as unknown as string);
      vi.stubEnv("NODE_ENV", "Development");
      expect(allowsDeveloperAffordances()).toBe(false);
    });
  });

  it("consults no hostname — a Host header cannot unlock the bypass", () => {
    // Comments stripped first: this module's own doc block explains WHY it
    // ignores the host, so a raw-source regex would match the prose and
    // fail on a correct implementation.
    const code = readFileSync(resolve(process.cwd(), "src/lib/runtime-env.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/hostname|window\.location|headers\(\)|\bhost\b/i);
    // It reads exactly two env vars and nothing else.
    const envReads = [...code.matchAll(/process\.env\["([^"]+)"\]/g)].map((m) => m[1]);
    expect([...new Set(envReads)].sort()).toEqual(["NODE_ENV", "VERCEL_ENV"]);
  });
});

describe("the onboarding page consults the gate", () => {
  const PAGE = readFileSync(
    resolve(process.cwd(), "src/app/(auth)/onboarding/page.tsx"),
    "utf-8",
  );

  const GATE = /preview\s*===\s*"1"\s*&&\s*allowsDeveloperAffordances\(\)/;

  it("gates ?preview=1 on the environment predicate", () => {
    expect(PAGE).toMatch(GATE);
  });

  it("imports the predicate rather than re-deriving the environment inline", () => {
    expect(PAGE).toContain('from "@/lib/runtime-env"');
    // A second, hand-rolled VERCEL_ENV check here would be a place for the
    // two answers to drift apart.
    expect(PAGE).not.toContain("VERCEL_ENV");
  });

  it("MUTATION CONTROL — the guard fails on the pre-fix source", () => {
    // This is the exact expression that shipped. If the regex above matched
    // it, the guard would be worthless.
    const preFix = PAGE.replace(GATE, 'preview === "1"');
    expect(preFix).not.toMatch(GATE);
    expect(preFix).not.toBe(PAGE);
  });
});
