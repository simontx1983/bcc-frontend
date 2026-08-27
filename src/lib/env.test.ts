import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * NEXT_PUBLIC_BCC_API_URL must name the WordPress host and nothing else.
 *
 * Three hosts serve this product and only one of them serves WordPress:
 * the apex is the Vercel frontend (403 on /wp-json), `cms.` is WordPress,
 * `stage.` is staging WordPress. Pointing the API base at the wrong one is a
 * configuration mistake no type can catch, and both wrong answers fail
 * quietly:
 *
 *   apex   -> builds and deploys fine, then every data fetch 403s at runtime
 *   stage  -> production serves STAGING DATA under the real domain
 *
 * `clientEnv` is evaluated at module load, so each case re-imports the module
 * with a fresh env rather than calling a function directly — which also pins
 * that the check runs at import, not lazily on first use.
 */
async function loadEnv(apiUrl: string, vercelEnv?: string): Promise<unknown> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BCC_API_URL", apiUrl);
  if (vercelEnv !== undefined) {
    vi.stubEnv("VERCEL_ENV", vercelEnv);
  }
  return import("./env");
}

describe("clientEnv.BCC_API_URL host guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts the WordPress host", async () => {
    const mod = (await loadEnv("https://cms.bluecollarcrypto.io")) as {
      clientEnv: { BCC_API_URL: string };
    };

    expect(mod.clientEnv.BCC_API_URL).toBe("https://cms.bluecollarcrypto.io");
  });

  it("strips a single trailing slash", async () => {
    const mod = (await loadEnv("https://cms.bluecollarcrypto.io/")) as {
      clientEnv: { BCC_API_URL: string };
    };

    expect(mod.clientEnv.BCC_API_URL).toBe("https://cms.bluecollarcrypto.io");
  });

  it("rejects the apex, which is this frontend and 403s on /wp-json", async () => {
    await expect(loadEnv("https://bluecollarcrypto.io")).rejects.toThrow(/apex/i);
  });

  it("rejects the www apex too", async () => {
    await expect(loadEnv("https://www.bluecollarcrypto.io")).rejects.toThrow(/apex/i);
  });

  it("rejects staging from a production build", async () => {
    await expect(
      loadEnv("https://stage.bluecollarcrypto.io", "production")
    ).rejects.toThrow(/staging/i);
  });

  it("ALLOWS staging when the build is not production", async () => {
    // Staging and preview deploys legitimately point at stage. Rejecting them
    // would make this guard unusable on the only environment that needs it.
    const mod = (await loadEnv("https://stage.bluecollarcrypto.io", "preview")) as {
      clientEnv: { BCC_API_URL: string };
    };

    expect(mod.clientEnv.BCC_API_URL).toBe("https://stage.bluecollarcrypto.io");
  });

  it("leaves local development hosts alone", async () => {
    const mod = (await loadEnv("http://blue-collar-crypto-custom.local")) as {
      clientEnv: { BCC_API_URL: string };
    };

    expect(mod.clientEnv.BCC_API_URL).toBe("http://blue-collar-crypto-custom.local");
  });

  it("rejects a value that is not a URL at all", async () => {
    await expect(loadEnv("cms.bluecollarcrypto.io")).rejects.toThrow(/not a valid URL/i);
  });

  it("still rejects an empty value with the missing-var message", async () => {
    await expect(loadEnv("")).rejects.toThrow(/Missing required env var/i);
  });
});
