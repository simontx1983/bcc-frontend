/**
 * The typed client layer.
 *
 * These paths do not exist on any deployed backend yet, so nothing here
 * can be proven against a live server. What CAN be proven — and is worth
 * proving, because it is where a contract-first slice silently drifts —
 * is the request each wrapper builds: path shape, query threading, and
 * the `mode` → `status` translation.
 *
 * That translation is the sharpest edge. The client calls the field
 * `mode` because it is a request verb, while the wire calls it `status`.
 * Sending `mode` would be accepted by no backend and caught by no type.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const bccFetchAsClient = vi.fn();
const bccFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  bccFetchAsClient: (...a: unknown[]) => bccFetchAsClient(...a),
  bccFetch: (...a: unknown[]) => bccFetch(...a),
}));

const endpoints = await import("@/lib/api/announcement-endpoints");

beforeEach(() => {
  vi.clearAllMocks();
  bccFetchAsClient.mockResolvedValue({});
  bccFetch.mockResolvedValue({});
});

/**
 * The shape we actually assert on. Declared rather than reaching for
 * `Record<string, unknown>`, whose index signature forces bracket access
 * under this repo's `noPropertyAccessFromIndexSignature`.
 */
interface SentBody {
  title?: string;
  summary?: string;
  body?: string;
  status?: string;
  publish_at?: string;
  comments_enabled?: boolean;
  mode?: unknown;
  parent_id?: unknown;
}

interface SentOptions {
  method?: string;
  token?: string | null;
  body?: SentBody;
  revalidate?: number;
}

/** First argument of the most recent call — the request path. */
function lastPath(mock: typeof bccFetchAsClient): string {
  return mock.mock.calls[mock.mock.calls.length - 1]?.[0] as string;
}
function lastOptions(mock: typeof bccFetchAsClient): SentOptions {
  return mock.mock.calls[mock.mock.calls.length - 1]?.[1] as SentOptions;
}

describe("list", () => {
  it("builds the validator-scoped path", async () => {
    await endpoints.listAnnouncements({ pageId: 1842 });
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements");
  });

  it("threads state, limit and cursor", async () => {
    await endpoints.listAnnouncements({
      pageId: 1842,
      state: "archived",
      limit: 20,
      cursor: "eyJ0IjoxfQ",
    });
    const path = lastPath(bccFetchAsClient);
    expect(path).toContain("state=archived");
    expect(path).toContain("limit=20");
    expect(path).toContain("cursor=eyJ0IjoxfQ");
  });

  it("omits an empty cursor rather than sending cursor=", async () => {
    await endpoints.listAnnouncements({ pageId: 1842, cursor: "" });
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements");
  });
});

describe("create — the mode → status translation", () => {
  it("sends status, never mode", async () => {
    await endpoints.createAnnouncement(1842, {
      title: "T",
      summary: "S",
      body: "B",
      mode: "publish",
      comments_enabled: true,
    });
    const body = lastOptions(bccFetchAsClient).body ?? {};
    expect(body.status).toBe("publish");
    expect(body).not.toHaveProperty("mode");
  });

  it("carries publish_at only when scheduling", async () => {
    await endpoints.createAnnouncement(1842, {
      title: "T",
      summary: "S",
      body: "B",
      mode: "schedule",
      publish_at: "2030-01-01T00:00:00.000Z",
      comments_enabled: true,
    });
    expect((lastOptions(bccFetchAsClient).body ?? {}).publish_at).toBe(
      "2030-01-01T00:00:00.000Z",
    );
  });

  /**
   * A stray publish_at on an immediate publish would invite the server to
   * treat a "publish now" as a schedule.
   */
  it("drops publish_at when the mode is not schedule", async () => {
    await endpoints.createAnnouncement(1842, {
      title: "T",
      summary: "S",
      body: "B",
      mode: "publish",
      publish_at: "2030-01-01T00:00:00.000Z",
      comments_enabled: true,
    });
    expect(lastOptions(bccFetchAsClient).body).not.toHaveProperty("publish_at");
  });

  it("always sends the summary — it is never optional on the wire", async () => {
    await endpoints.createAnnouncement(1842, {
      title: "T",
      summary: "S",
      body: "B",
      mode: "draft",
      comments_enabled: false,
    });
    const body = lastOptions(bccFetchAsClient).body ?? {};
    expect(body.summary).toBe("S");
    expect(body.comments_enabled).toBe(false);
  });
});

describe("pin is one call, not two", () => {
  it("pins with POST", async () => {
    await endpoints.setAnnouncementPin(1842, "ann_1", true);
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/ann_1/pin");
    expect(lastOptions(bccFetchAsClient).method).toBe("POST");
  });

  it("unpins with DELETE on the same path", async () => {
    await endpoints.setAnnouncementPin(1842, "ann_1", false);
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/ann_1/pin");
    expect(lastOptions(bccFetchAsClient).method).toBe("DELETE");
  });
});

describe("archive", () => {
  it("POSTs to the archive sub-path", async () => {
    await endpoints.archiveAnnouncement(1842, "ann_1");
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/ann_1/archive");
    expect(lastOptions(bccFetchAsClient).method).toBe("POST");
  });
});

describe("detail read", () => {
  /**
   * The detail response carries a viewer-specific capability block, so it
   * must never be handed a `revalidate` window — a shared cache entry
   * would serve one viewer's owner controls to another.
   */
  it("passes the token through and never sets a cache window", async () => {
    await endpoints.getAnnouncement(1842, "ann_1", "jwt-token");
    const options = lastOptions(bccFetch);
    expect(options.token).toBe("jwt-token");
    expect(options).not.toHaveProperty("revalidate");
  });
});

describe("comments", () => {
  it("is keyed on the announcement, not the validator page", async () => {
    await endpoints.listAnnouncementComments({ announcementId: "ann_1" });
    expect(lastPath(bccFetchAsClient)).toBe("announcements/ann_1/comments");
  });

  it("sends only a body — v1 comments are flat, so no parent_id", async () => {
    await endpoints.createAnnouncementComment({
      announcementId: "ann_1",
      body: "hello",
    });
    const body = lastOptions(bccFetchAsClient).body ?? {};
    expect(body).toEqual({ body: "hello" });
    expect(body).not.toHaveProperty("parent_id");
  });

  it("removes by DELETE on the comment sub-path", async () => {
    await endpoints.removeAnnouncementComment({
      announcementId: "ann_1",
      commentId: "acmt_9",
    });
    expect(lastPath(bccFetchAsClient)).toBe("announcements/ann_1/comments/acmt_9");
    expect(lastOptions(bccFetchAsClient).method).toBe("DELETE");
  });
});

describe("no fallback endpoints exist", () => {
  /**
   * A missing backend must read as missing. If a wrapper ever gained a
   * try/catch that retried against some other path, this slice would
   * start looking finished while the real routes were still unbuilt.
   */
  it("lets a rejection propagate instead of retrying elsewhere", async () => {
    bccFetchAsClient.mockRejectedValueOnce(new Error("404"));
    await expect(endpoints.listAnnouncements({ pageId: 1842 })).rejects.toThrow("404");
    expect(bccFetchAsClient).toHaveBeenCalledTimes(1);
  });
});
