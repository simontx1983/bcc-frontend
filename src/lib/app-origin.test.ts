import { afterEach, describe, expect, it, vi } from "vitest";

import { appOrigin } from "./app-origin";

/**
 * appOrigin() feeds `metadataBase`, so a wrong answer here is stamped
 * into every og:image and canonical URL on the site — and stays silent,
 * because the page still renders either way. These tests pin the
 * precedence, and in particular pin the two behaviours that exist to
 * make a misconfiguration loud instead of quiet.
 */
describe("appOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers NEXTAUTH_URL over every Vercel variable", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://bluecollarcrypto.io");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "bcc-frontend-hash-team.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "somewhere-else.io");

    expect(appOrigin()).toBe("https://bluecollarcrypto.io");
  });

  it("strips a single trailing slash from NEXTAUTH_URL", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://bluecollarcrypto.io/");

    expect(appOrigin()).toBe("https://bluecollarcrypto.io");
  });

  it("uses the stable production domain, NOT the ephemeral deployment host", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "bcc-frontend-9f2c1a-team.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "bluecollarcrypto.io");

    // The regression this guards: VERCEL_URL is per-deployment, so using
    // it would put a throwaway hostname in every share card.
    expect(appOrigin()).toBe("https://bluecollarcrypto.io");
  });

  it("uses the per-deployment host on preview builds", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "bcc-frontend-git-staging-team.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "bluecollarcrypto.io");

    expect(appOrigin()).toBe(
      "https://bcc-frontend-git-staging-team.vercel.app"
    );
  });

  it("falls back to VERCEL_URL on preview when no branch URL is set", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "");
    vi.stubEnv("VERCEL_URL", "bcc-frontend-abc123-team.vercel.app");

    expect(appOrigin()).toBe("https://bcc-frontend-abc123-team.vercel.app");
  });

  it("falls back to localhost outside production", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(appOrigin()).toBe("http://localhost:3000");
  });

  it("throws rather than silently using localhost in production", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    // Loud at build time beats localhost URLs discovered by a user
    // clicking a broken share card weeks later.
    expect(() => appOrigin()).toThrow(/NEXTAUTH_URL/);
  });
});
