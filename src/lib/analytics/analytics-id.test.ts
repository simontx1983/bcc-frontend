// @vitest-environment node
/**
 * The analytics pseudonym is a KEYED hash computed on the server: not
 * reversible by hashing 1..N without the secret, stable for one user, and
 * absent (no identify) when the secret is not configured.
 */

import { createHash, createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load() {
  vi.stubEnv("NEXT_PUBLIC_BCC_API_URL", "https://wp.example");
  return import("@/lib/analytics/analytics-id");
}

describe("analyticsIdFor", () => {
  it("is null when ANALYTICS_ID_SECRET is unset (stay anonymous)", async () => {
    vi.stubEnv("ANALYTICS_ID_SECRET", "");
    const { analyticsIdFor } = await load();
    expect(analyticsIdFor("17")).toBeNull();
  });

  it("is an HMAC under the secret: stable, per-user, and not the plain SHA-256", async () => {
    vi.stubEnv("ANALYTICS_ID_SECRET", "test-secret");
    const { analyticsIdFor } = await load();
    const id = analyticsIdFor("17");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(analyticsIdFor("17")).toBe(id);
    expect(analyticsIdFor("18")).not.toBe(id);
    expect(id).not.toBe(createHash("sha256").update("17").digest("hex"));
    expect(id).toBe(createHmac("sha256", "test-secret").update("bcc-analytics-id:v1:17").digest("hex"));
  });

  it("changes with the secret, so it cannot be recomputed without it", async () => {
    vi.stubEnv("ANALYTICS_ID_SECRET", "secret-a");
    const a = (await load()).analyticsIdFor("17");
    vi.resetModules();
    vi.stubEnv("ANALYTICS_ID_SECRET", "secret-b");
    const b = (await load()).analyticsIdFor("17");
    expect(a).not.toBe(b);
  });

  it("is null for an empty user id", async () => {
    vi.stubEnv("ANALYTICS_ID_SECRET", "test-secret");
    const { analyticsIdFor } = await load();
    expect(analyticsIdFor("")).toBeNull();
  });
});
