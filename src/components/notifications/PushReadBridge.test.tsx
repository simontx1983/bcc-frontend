/**
 * F-516: PushReadBridge marks an opened push's bell rows read, from the
 * `?bcc_read=` param a new tab carries or the worker's message to a tab
 * already open, for signed-in viewers only, never without ids.
 */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  status: "authenticated" as "authenticated" | "unauthenticated" | "loading",
  mutate: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: h.status }),
}));
vi.mock("@/hooks/useNotifications", () => ({
  useMarkPushedReadMutation: () => ({ mutate: h.mutate }),
}));

import { PushReadBridge } from "@/components/notifications/PushReadBridge";

/** A minimal ServiceWorkerContainer: just the message listeners. */
function fakeWorker() {
  const target = new EventTarget();
  Object.defineProperty(window.navigator, "serviceWorker", { value: target, configurable: true });
  return {
    post: (data: unknown) => target.dispatchEvent(new MessageEvent("message", { data })),
  };
}

function at(path: string) {
  window.history.replaceState(null, "", path);
}

beforeEach(() => {
  h.status = "authenticated";
  h.mutate.mockReset();
  at("/");
});

afterEach(() => {
  Reflect.deleteProperty(window.navigator, "serviceWorker");
});

describe("PushReadBridge: a tab the push opened", () => {
  it("marks the ids from ?bcc_read= and drops the param, keeping the rest of the URL", () => {
    at("/post/77?tab=comments&bcc_read=21,22#c9");
    render(<PushReadBridge />);

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledWith([21, 22]);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      "/post/77?tab=comments#c9"
    );
  });

  it("drops an invalid param and marks nothing", () => {
    at("/post/77?bcc_read=0,abc");
    render(<PushReadBridge />);

    expect(h.mutate).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("does nothing without the param", () => {
    at("/post/77?tab=comments");
    render(<PushReadBridge />);

    expect(h.mutate).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?tab=comments");
  });

  it("signed out: drops the param, marks nothing", () => {
    h.status = "unauthenticated";
    at("/post/77?bcc_read=21");
    render(<PushReadBridge />);

    expect(h.mutate).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("waits while the session loads, then marks once it is signed in", () => {
    h.status = "loading";
    at("/post/77?bcc_read=21");
    const view = render(<PushReadBridge />);

    expect(h.mutate).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?bcc_read=21");

    h.status = "authenticated";
    view.rerender(<PushReadBridge />);
    expect(h.mutate).toHaveBeenCalledWith([21]);
  });
});

describe("PushReadBridge: a tab already open on the push's URL", () => {
  it("marks the ids the worker posts", () => {
    const worker = fakeWorker();
    render(<PushReadBridge />);

    worker.post({ type: "bcc:mark-read", ids: [31, 32] });

    expect(h.mutate).toHaveBeenCalledWith([31, 32]);
  });

  it.each([
    ["another message type", { type: "something-else", ids: [31] }],
    ["no ids", { type: "bcc:mark-read" }],
    ["an empty list", { type: "bcc:mark-read", ids: [] }],
    ["junk ids", { type: "bcc:mark-read", ids: ["x"] }],
    ["not an object", "bcc:mark-read"],
  ])("ignores %s", (_label, data) => {
    const worker = fakeWorker();
    render(<PushReadBridge />);

    worker.post(data);

    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("listens only while signed in", () => {
    h.status = "unauthenticated";
    const worker = fakeWorker();
    render(<PushReadBridge />);

    worker.post({ type: "bcc:mark-read", ids: [31] });

    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("stops listening when unmounted (a session teardown unmounts it)", () => {
    const worker = fakeWorker();
    const view = render(<PushReadBridge />);
    view.unmount();

    worker.post({ type: "bcc:mark-read", ids: [31] });

    expect(h.mutate).not.toHaveBeenCalled();
  });
});
