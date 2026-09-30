/**
 * The announcement detail route fails closed, and no fixture can reach
 * production code.
 *
 * These replace a manual poke at the Vercel preview, which is behind
 * deployment protection and cannot be reached unauthenticated. A test is
 * the better instrument anyway: it keeps holding after the preview is
 * gone.
 *
 * The property under test is that a backend which has never heard of
 * announcements — every backend today — produces a **404**, not a blank
 * page, not a partially-initialised one, and not a request to a route
 * that does not exist.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const notFound = vi.fn(() => {
  // Next's notFound() throws to halt rendering; mirror that so a caller
  // that ignores it cannot silently continue to render a partial page.
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const getCardEntity = vi.fn();
vi.mock("@/lib/api/card-endpoints", () => ({
  getCardEntity: (...a: unknown[]) => getCardEntity(...a),
}));

const getAnnouncement = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  getAnnouncement: (...a: unknown[]) => getAnnouncement(...a),
}));

vi.mock("@/components/announcements/AnnouncementDetailView", () => ({
  AnnouncementDetailView: () => <div data-testid="detail" />,
}));

const AnnouncementDetailPage = (
  await import("@/app/(main)/(app)/v/[slug]/a/[id]/page")
).default;

/** A validator card WITHOUT the announcements block — today's reality. */
const CARD_WITHOUT_FEATURE = { id: 1842, name: "Blacksmith Node" };
/** The same card once a future backend advertises the feature. */
const CARD_WITH_FEATURE = {
  ...CARD_WITHOUT_FEATURE,
  announcements: {
    capabilities: {
      can_create: { allowed: false, unlock_hint: null, reason_code: "not_claimer" },
      can_manage: { allowed: false, unlock_hint: null, reason_code: "not_claimer" },
    },
  },
};

const params = Promise.resolve({ slug: "blacksmith-node", id: "ann_4471" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("capability absent — the state of every backend today", () => {
  it("404s instead of rendering a blank or half-built page", async () => {
    getCardEntity.mockResolvedValue(CARD_WITHOUT_FEATURE);

    await expect(AnnouncementDetailPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  /**
   * The load-bearing half. 404-ing but still calling the announcement
   * endpoint would mean the app pings routes that do not exist on every
   * request — turning an unbuilt feature into a wall of server errors.
   */
  it("never requests an announcement the backend cannot serve", async () => {
    getCardEntity.mockResolvedValue(CARD_WITHOUT_FEATURE);

    await expect(AnnouncementDetailPage({ params })).rejects.toThrow();
    expect(getAnnouncement).not.toHaveBeenCalled();
  });

  it("404s when the validator itself is missing", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    getCardEntity.mockRejectedValue(new BccApiError("bcc_not_found", "", 404, null));

    await expect(AnnouncementDetailPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getAnnouncement).not.toHaveBeenCalled();
  });
});

describe("capability present — the gate opens only then", () => {
  it("fetches the announcement once the server advertises the feature", async () => {
    getCardEntity.mockResolvedValue(CARD_WITH_FEATURE);
    getAnnouncement.mockResolvedValue({ id: "ann_4471", title: "t" });

    await AnnouncementDetailPage({ params });
    expect(getAnnouncement).toHaveBeenCalledWith(1842, "ann_4471", null);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("404s — never 403 — when the announcement is not visible to this viewer", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    getCardEntity.mockResolvedValue(CARD_WITH_FEATURE);
    getAnnouncement.mockRejectedValue(new BccApiError("bcc_not_found", "", 404, null));

    await expect(AnnouncementDetailPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("also 404s a 403, so a draft's existence is never confirmed", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    getCardEntity.mockResolvedValue(CARD_WITH_FEATURE);
    getAnnouncement.mockRejectedValue(new BccApiError("bcc_forbidden", "", 403, null));

    await expect(AnnouncementDetailPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("fixtures cannot reach production code", () => {
  const SRC = resolve(process.cwd(), "src");

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, out);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  /**
   * The fixtures exist so the UI can be proven against the contract with
   * no backend. If one ever leaked into a shipped path it would make an
   * unbuilt feature look finished — the exact failure this whole slice
   * is shaped to avoid.
   */
  it("is imported only by tests", () => {
    const files = walk(SRC);
    expect(files.length, "the source scan matched nothing").toBeGreaterThan(200);

    const offenders = files
      .filter((f) => !/\.(test|spec)\.tsx?$/.test(f))
      .filter((f) => /announcements\/fixtures/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1));

    expect(offenders, "a non-test file imports the announcement fixtures").toEqual([]);
  });

  it("ships no screenshot harness", () => {
    const harnesses = walk(SRC)
      .map((f) => f.slice(SRC.length + 1))
      .filter((f) => /harness/i.test(f));
    expect(harnesses).toEqual([]);
  });
});
