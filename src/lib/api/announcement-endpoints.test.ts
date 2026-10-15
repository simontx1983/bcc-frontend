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
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/1/pin");
    expect(lastOptions(bccFetchAsClient).method).toBe("POST");
  });

  it("unpins with DELETE on the same path", async () => {
    await endpoints.setAnnouncementPin(1842, "ann_1", false);
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/1/pin");
    expect(lastOptions(bccFetchAsClient).method).toBe("DELETE");
  });
});

describe("archive", () => {
  it("POSTs to the archive sub-path", async () => {
    await endpoints.archiveAnnouncement(1842, "ann_1");
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/1/archive");
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
    expect(lastPath(bccFetchAsClient)).toBe("announcements/1/comments");
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
    expect(lastPath(bccFetchAsClient)).toBe("announcements/1/comments/9");
    expect(lastOptions(bccFetchAsClient).method).toBe("DELETE");
  });
});

/**
 * The routes take BARE NUMERIC ids; the wire hands callers prefixed
 * view-model ids (`ann_36`, `acmt_21`). Sending the prefixed form produces a
 * URL that matches no route and returns a flat 404 that reads exactly like
 * "this announcement does not exist".
 *
 * These cases exist because the suite could not previously see that: every
 * path assertion above was written against the prefixed form, so the tests
 * agreed with the client and both were wrong. It took pointing the frontend
 * at a real backend — `/announcements/ann_36/comments` → 404, the whole
 * discussion replaced by "Couldn't load this discussion" — to show it.
 */
describe("path ids are bare numerics, never the prefixed view-model form", () => {
  it("strips `ann_` on every validator-scoped route", async () => {
    await endpoints.updateAnnouncement(1842, "ann_36", { title: "t" });
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/36");

    await endpoints.archiveAnnouncement(1842, "ann_36");
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/36/archive");

    await endpoints.setAnnouncementPin(1842, "ann_36", true);
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/36/pin");

    await endpoints.getAnnouncementAsClient(1842, "ann_36");
    expect(lastPath(bccFetchAsClient)).toBe("validators/1842/announcements/36");
  });

  it("strips `ann_` and `acmt_` on every comment route", async () => {
    await endpoints.listAnnouncementComments({ announcementId: "ann_36" });
    expect(lastPath(bccFetchAsClient)).toBe("announcements/36/comments");

    await endpoints.createAnnouncementComment({ announcementId: "ann_36", body: "x" });
    expect(lastPath(bccFetchAsClient)).toBe("announcements/36/comments");

    await endpoints.removeAnnouncementComment({
      announcementId: "ann_36",
      commentId: "acmt_21",
    });
    expect(lastPath(bccFetchAsClient)).toBe("announcements/36/comments/21");
  });

  it("accepts an already-bare id unchanged", async () => {
    // The detail PAGE hands the raw route segment, which is already bare.
    // That is why the detail route was the one surface that worked.
    await endpoints.listAnnouncementComments({ announcementId: "36" });
    expect(lastPath(bccFetchAsClient)).toBe("announcements/36/comments");
  });

  it("refuses an id that is not numeric once stripped, instead of requesting a URL that cannot work", async () => {
    // Silently sending garbage is what produced a 404 indistinguishable from
    // a missing announcement. A typed refusal is the honest answer.
    await expect(
      endpoints.listAnnouncementComments({ announcementId: "ann_not-a-number" }),
    ).rejects.toMatchObject({ code: "bcc_invalid_request" });

    await expect(
      endpoints.removeAnnouncementComment({
        announcementId: "ann_36",
        commentId: "acmt_",
      }),
    ).rejects.toMatchObject({ code: "bcc_invalid_request" });
  });

  it("does not strip a prefix out of the middle of an id", async () => {
    // Only a LEADING prefix is a view-model artifact.
    await expect(
      endpoints.listAnnouncementComments({ announcementId: "36_ann_7" }),
    ).rejects.toMatchObject({ code: "bcc_invalid_request" });
  });
});

/**
 * The owner list is the ONLY capability-bearing list. The public list
 * carries none for anybody, operator included, so a management control
 * cannot be driven from it — which is the entire reason this wrapper
 * exists.
 */
describe("owner list", () => {
  it("builds the me/-prefixed validator-scoped path", async () => {
    await endpoints.listOwnerAnnouncements({ pageId: 1842, status: "published" });
    expect(lastPath(bccFetchAsClient)).toBe(
      "me/validators/1842/announcements?status=published",
    );
  });

  it("sends status on every call — omitting it is NOT 'everything'", async () => {
    // The server's default is the unpublished set, so a caller that wants
    // published rows has to say so. The wrapper requires it at the type
    // level; this pins that it actually reaches the wire.
    for (const status of ["draft", "scheduled", "blocked", "published"] as const) {
      await endpoints.listOwnerAnnouncements({ pageId: 7, status });
      expect(lastPath(bccFetchAsClient)).toContain(`status=${status}`);
    }
  });

  it("threads cursor and limit", async () => {
    await endpoints.listOwnerAnnouncements({
      pageId: 7,
      status: "published",
      cursor: "ann_owner:abc",
      limit: 20,
    });
    const path = lastPath(bccFetchAsClient);
    expect(path).toContain("status=published");
    expect(path).toContain("limit=20");
    expect(path).toContain(`cursor=${encodeURIComponent("ann_owner:abc")}`);
  });

  it("omits an empty cursor rather than sending cursor=", async () => {
    await endpoints.listOwnerAnnouncements({ pageId: 7, status: "published", cursor: "" });
    expect(lastPath(bccFetchAsClient)).not.toContain("cursor");
  });

  it("goes through the browser client, so the viewer's bearer is attached", async () => {
    await endpoints.listOwnerAnnouncements({ pageId: 7, status: "published" });
    expect(bccFetchAsClient).toHaveBeenCalled();
    // Never the server-side client: this read is viewer-specific and must
    // not land in a shared Data Cache entry.
    expect(bccFetch).not.toHaveBeenCalled();
    expect(lastOptions(bccFetchAsClient).method).toBe("GET");
  });

  it("does not swallow the 403 a non-operator gets", async () => {
    bccFetchAsClient.mockRejectedValueOnce(new Error("bcc_forbidden"));
    await expect(
      endpoints.listOwnerAnnouncements({ pageId: 7, status: "published" }),
    ).rejects.toThrow("bcc_forbidden");
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
