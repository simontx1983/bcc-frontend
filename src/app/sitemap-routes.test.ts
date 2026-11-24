/**
 * F-518: /sitemap.xml (an index) and /sitemaps/{section}.xml, built from
 * the backend's public index (contract §4.33).
 *
 * The upstream page reader is stubbed; the paging, the all-or-nothing
 * rule, the statuses and the caching run for real. `unstable_cache` only
 * works inside a Next server, so it is replaced by a stand-in with the
 * same contract that matters here: a resolved value is reused until its
 * `revalidate` window passes, and a thrown failure is never stored.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const h = vi.hoisted(() => {
  const store = new Map<string, { value: unknown; at: number }>();
  function fakeUnstableCache<A extends unknown[], R>(
    fn: (...args: A) => Promise<R>,
    keyParts: string[] = [],
    options: { revalidate?: number | false } = {},
  ): (...args: A) => Promise<R> {
    return async (...args: A) => {
      const key = JSON.stringify([keyParts, args]);
      const ttl =
        options.revalidate === undefined || options.revalidate === false ? Infinity : options.revalidate * 1000;
      const hit = store.get(key);
      if (hit !== undefined && Date.now() - hit.at < ttl) return hit.value as R;
      const value = await fn(...args);
      store.set(key, { value, at: Date.now() });
      return value;
    };
  }
  return { store, fakeUnstableCache, getSitemapPage: vi.fn(), captureMessage: vi.fn() };
});

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example/wp-json/bcc/v1" } }));
vi.mock("next/cache", () => ({ unstable_cache: h.fakeUnstableCache }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: h.captureMessage }));
vi.mock("@/lib/api/sitemap-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSitemapPage: (...a: unknown[]) => h.getSitemapPage(...a),
}));

const indexRoute = await import("@/app/sitemap.xml/route");
const { GET: getIndex } = indexRoute;
const { GET: getSection } = await import("@/app/sitemaps/[section]/route");
const { MAX_SCAN_PAGES, SITEMAP_CACHE_SECONDS } = await import("@/lib/seo/public-index");

const ORIGINAL_ENV = { ...process.env };

function setEnv(vercelEnv: string | undefined, nextAuthUrl: string) {
  if (vercelEnv === undefined) delete process.env["VERCEL_ENV"];
  else process.env["VERCEL_ENV"] = vercelEnv;
  process.env["NEXTAUTH_URL"] = nextAuthUrl;
}

function page(paths: string[], nextAfter: number | null) {
  return { items: paths.map((path) => ({ path })), next_after: nextAfter };
}

function apiError(code: string, status: number, data: Record<string, unknown> | null = null) {
  return new BccApiError(code, "raw", status, { error: { code, message: "raw", status, data } } as never);
}

function section(file: string) {
  return getSection(new Request(`https://bluecollarcrypto.io/sitemaps/${file}`), {
    params: Promise.resolve({ section: file }),
  });
}

/** Upstream answers in order; anything past the script is a test bug. */
function upstream(...answers: Array<ReturnType<typeof page> | Error>) {
  for (const a of answers) {
    if (a instanceof Error) h.getSitemapPage.mockRejectedValueOnce(a);
    else h.getSitemapPage.mockResolvedValueOnce(a);
  }
}

beforeEach(() => {
  h.store.clear();
  h.getSitemapPage.mockReset();
  h.getSitemapPage.mockRejectedValue(new Error("unscripted upstream call"));
  h.captureMessage.mockReset();
  setEnv("production", "https://bluecollarcrypto.io");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...ORIGINAL_ENV };
});

describe("/sitemap.xml (the index)", () => {
  it("is evaluated per request, never prerendered with the build's environment", () => {
    // Without this, `next build` marks the route static and serves the
    // build-time answer (a 404) forever. Found by a production build.
    expect(indexRoute.dynamic).toBe("force-dynamic");
  });

  it("lists one absolute sitemap per section", async () => {
    upstream(page(["/u/alice"], 1));
    const res = await getIndex();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=3600");
    const xml = await res.text();
    expect(xml).toContain("<sitemapindex");
    for (const s of ["members", "pages", "groups"]) {
      expect(xml).toContain(`<loc>https://bluecollarcrypto.io/sitemaps/${s}.xml</loc>`);
    }
    // The probe is one small page, not a scan.
    expect(h.getSitemapPage).toHaveBeenCalledTimes(1);
    expect(h.getSitemapPage).toHaveBeenCalledWith("members", 0, 1);
  });

  it("is 404 (as before F-518) when the backend has no sitemap routes", async () => {
    upstream(apiError("rest_no_route", 404));
    const res = await getIndex();
    expect(res.status).toBe(404);
  });

  it("is 503 with Retry-After, never cached, when the backend can't answer", async () => {
    upstream(apiError("bcc_unavailable", 503));
    const res = await getIndex();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Retry-After")).toBe(String(SITEMAP_CACHE_SECONDS));
    expect(await res.text()).not.toContain("<sitemap");
  });

  it.each([
    ["staging", "production", "https://stage.bluecollarcrypto.io"],
    ["a preview", "preview", "https://bcc-git-x.vercel.app"],
    ["local", undefined, "http://localhost:3000"],
  ])("is 404 on %s without asking the backend", async (_label, env, url) => {
    setEnv(env, url);
    expect((await getIndex()).status).toBe(404);
    expect(h.getSitemapPage).not.toHaveBeenCalled();
  });
});

describe("/sitemaps/{section}.xml", () => {
  it("pages through to the end, empty pages included, and emits absolute URLs", async () => {
    upstream(page(["/u/alice", "/u/bob"], 1000), page([], 2000), page(["/u/carol"], null));
    const res = await section("members.xml");
    expect(res.status).toBe(200);
    expect(h.getSitemapPage.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ["members", 0],
      ["members", 1000],
      ["members", 2000],
    ]);
    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml.match(/<url>/g)).toHaveLength(3);
    expect(xml).toContain("<loc>https://bluecollarcrypto.io/u/alice</loc>");
    expect(xml).toContain("<loc>https://bluecollarcrypto.io/u/carol</loc>");
  });

  it("escapes XML in paths", async () => {
    upstream(page(["/c/salt&pepper"], null));
    const xml = await (await section("pages.xml")).text();
    expect(xml).toContain("<loc>https://bluecollarcrypto.io/c/salt&amp;pepper</loc>");
  });

  it("a 503 on a later page fails the whole file: no partial list", async () => {
    upstream(page(["/u/alice"], 1000), apiError("bcc_unavailable", 503));
    const res = await section("members.xml");
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).not.toContain("alice");
  });

  it("a rate limit waits as long as the server says", async () => {
    upstream(apiError("bcc_rate_limited", 429, { retry_after_seconds: 12 }));
    const res = await section("groups.xml");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("12");
  });

  it("a network failure is a 503", async () => {
    upstream(new TypeError("fetch failed"));
    expect((await section("groups.xml")).status).toBe(503);
  });

  it("is 404 when the backend has no sitemap routes", async () => {
    upstream(apiError("rest_no_route", 404));
    expect((await section("members.xml")).status).toBe(404);
  });

  it.each(["people.xml", "members", "members.xml.gz", "..%2Fmembers.xml"])(
    "is 404 for %s, without asking the backend",
    async (file) => {
      expect((await section(file)).status).toBe(404);
      expect(h.getSitemapPage).not.toHaveBeenCalled();
    },
  );

  it("is 404 off production without asking the backend", async () => {
    setEnv("production", "https://stage.bluecollarcrypto.io");
    expect((await section("members.xml")).status).toBe(404);
    expect(h.getSitemapPage).not.toHaveBeenCalled();
  });

  it("skips (and reports) a path the app doesn't serve, keeping the rest", async () => {
    upstream(page(["/u/alice", "https://elsewhere.example/x", "//elsewhere.example", "u/bob", "/u/a b"], null));
    const xml = await (await section("members.xml")).text();
    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(xml).toContain("/u/alice");
    expect(xml).not.toContain("elsewhere");
    expect(h.captureMessage).toHaveBeenCalledTimes(4);
  });

  it("fails (and reports) rather than loop when next_after doesn't advance", async () => {
    upstream(page(["/u/alice"], 5), page(["/u/bob"], 5));
    expect((await section("members.xml")).status).toBe(503);
    expect(h.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("next_after did not advance"),
      expect.anything(),
    );
  });

  it("fails (and reports) rather than truncate when the scan never ends", async () => {
    h.getSitemapPage.mockImplementation(async (_s: string, after: number) => page([], after + 1));
    expect((await section("members.xml")).status).toBe(503);
    expect(h.getSitemapPage).toHaveBeenCalledTimes(MAX_SCAN_PAGES);
    expect(h.captureMessage).toHaveBeenCalledWith(expect.stringContaining("page guard"), expect.anything());
  });

  it("fails (and reports) rather than truncate past one sitemap's 50,000 URLs", async () => {
    upstream(page(Array.from({ length: 50_001 }, (_, i) => `/u/m${i}`), null));
    expect((await section("members.xml")).status).toBe(503);
    expect(h.captureMessage).toHaveBeenCalledWith(expect.stringContaining("URL limit"), expect.anything());
  });
});

describe("upstream cost is bounded by the cache", () => {
  it("a second request inside the window makes no upstream calls", async () => {
    upstream(page(["/u/alice"], 1000), page(["/u/bob"], null));
    expect((await section("members.xml")).status).toBe(200);
    expect(h.getSitemapPage).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date(Date.now() + (SITEMAP_CACHE_SECONDS - 1) * 1000));
    const again = await section("members.xml");
    expect(again.status).toBe(200);
    expect(await again.text()).toContain("/u/bob");
    expect(h.getSitemapPage).toHaveBeenCalledTimes(2);
  });

  it("the index probe is reused inside the window too", async () => {
    upstream(page(["/u/alice"], 1));
    await getIndex();
    await getIndex();
    expect(h.getSitemapPage).toHaveBeenCalledTimes(1);
  });

  it("re-reads once the window has passed", async () => {
    upstream(page(["/u/alice"], null), page(["/u/alice", "/u/bob"], null));
    await section("members.xml");
    vi.setSystemTime(new Date(Date.now() + (SITEMAP_CACHE_SECONDS + 1) * 1000));
    const xml = await (await section("members.xml")).text();
    expect(xml).toContain("/u/bob");
    expect(h.getSitemapPage).toHaveBeenCalledTimes(2);
  });

  it("a failure is not cached: the next request tries again", async () => {
    upstream(apiError("bcc_unavailable", 503), page(["/u/alice"], null));
    expect((await section("members.xml")).status).toBe(503);
    expect((await section("members.xml")).status).toBe(200);
  });

  it("sections are cached separately", async () => {
    upstream(page(["/u/alice"], null), page(["/v/atlas"], null));
    await section("members.xml");
    const xml = await (await section("pages.xml")).text();
    expect(xml).toContain("/v/atlas");
    expect(h.getSitemapPage).toHaveBeenCalledTimes(2);
  });
});
