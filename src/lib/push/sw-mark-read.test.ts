/**
 * F-516, the worker side: public/sw.js keeps a push's `notification_ids`
 * and hands them to the page on click, as a message to a tab already on
 * the push's URL (focused, never navigated) or as `?bcc_read=` on a tab
 * it opens. It runs the REAL sw.js in a vm sandbox with a fake `self`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://bluecollarcrypto.example";
const SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

interface FakeClient {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
}

function loadWorker(openTabs: FakeClient[] = []) {
  const listeners = new Map<string, (event: unknown) => void>();
  const shown: Array<{ title: string; options: { data?: unknown } }> = [];
  const openWindow = vi.fn(async (url: string) => ({ url }));
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    skipWaiting: () => undefined,
    registration: {
      showNotification: async (title: string, options: { data?: unknown }) => {
        shown.push({ title, options });
      },
    },
    clients: {
      claim: async () => undefined,
      matchAll: async () => openTabs,
      openWindow,
    },
  };
  runInNewContext(SOURCE, { self, URL, console });

  const fire = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  };

  return {
    shown,
    openWindow,
    push: (payload: unknown) => fire("push", { data: { json: () => payload, text: () => "" } }),
    click: (data: unknown) => fire("notificationclick", { notification: { data, close: () => undefined } }),
  };
}

function tab(path: string): FakeClient {
  return { url: `${ORIGIN}${path}`, focus: vi.fn(), postMessage: vi.fn() };
}

describe("sw.js push: notification_ids", () => {
  it("keeps the push's ids with the notification", async () => {
    const w = loadWorker();
    await w.push({ title: "t", body: "b", url: "/post/7", notification_ids: [11, 12, 11] });

    expect(w.shown[0]?.options.data).toEqual({ url: "/post/7", notificationIds: [11, 12] });
  });

  it.each([
    ["no key", undefined],
    ["an empty list", []],
    ["junk", ["11", -1]],
    ["too many", Array.from({ length: 51 }, (_, i) => i + 1)],
  ])("keeps none for %s", async (_label, ids) => {
    const w = loadWorker();
    await w.push({ title: "t", body: "b", url: "/post/7", notification_ids: ids });

    expect(w.shown[0]?.options.data).toEqual({ url: "/post/7", notificationIds: [] });
  });
});

describe("sw.js notificationclick: handing the ids to the page", () => {
  it("opens a new tab with ?bcc_read=, keeping the URL's own query and hash", async () => {
    const w = loadWorker();
    await w.click({ url: "/post/7?tab=c#x", notificationIds: [11, 12] });

    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/post/7?tab=c&bcc_read=11%2C12#x`);
  });

  it("posts the ids to a tab already on the URL, and focuses it without navigating", async () => {
    const open = tab("/post/7");
    const w = loadWorker([tab("/elsewhere"), open]);
    await w.click({ url: "/post/7", notificationIds: [11] });

    expect(open.postMessage).toHaveBeenCalledWith({ type: "bcc:mark-read", ids: [11] });
    expect(open.focus).toHaveBeenCalled();
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  it("without ids, opens the plain URL and posts nothing", async () => {
    const open = tab("/post/7");
    const w = loadWorker([open]);
    await w.click({ url: "/post/7", notificationIds: [] });

    expect(open.postMessage).not.toHaveBeenCalled();
    expect(open.focus).toHaveBeenCalled();

    const w2 = loadWorker();
    await w2.click({ url: "/post/7" });
    expect(w2.openWindow).toHaveBeenCalledWith("/post/7");
  });

  it("never sends the ids to another origin", async () => {
    const w = loadWorker();
    await w.click({ url: "https://elsewhere.example/x", notificationIds: [11] });

    expect(w.openWindow).toHaveBeenCalledWith("https://elsewhere.example/x");
  });

  it("re-validates ids stored with the notification", async () => {
    const w = loadWorker();
    await w.click({ url: "/post/7", notificationIds: [0, 11] });

    expect(w.openWindow).toHaveBeenCalledWith("/post/7");
  });
});
