/**
 * The "session unknown" gate state.
 *
 * When every confirming read of `/api/auth/session` is unreadable we do
 * not know whether the viewer departed. Two things must both be true:
 * nothing private may stay on screen, and nothing the viewer is part-way
 * through may be destroyed.
 *
 * That rules out the departure gate, which swaps the subtree for a
 * placeholder and therefore unmounts. `useComposerState` holds
 * `attachedFile: File`, a blob `previewUrl` and per-photo alt text; reply
 * boxes and the blog editor hold in-progress text. None of that is
 * recoverable from localStorage, so unmounting loses a selected photo
 * outright. So this state HIDES and DISABLES the subtree in place.
 */

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SignOutOpts {
  redirect?: boolean;
  callbackUrl?: string;
}
const signOut = vi.fn<(opts?: SignOutOpts) => Promise<undefined>>(
  async () => undefined,
);
const sessionState = vi.hoisted(() => ({
  data: null as { user?: { id?: string } } | null,
  status: "loading" as "loading" | "authenticated" | "unauthenticated",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  signOut: (opts?: SignOutOpts) => signOut(opts),
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
  getSession: async () => sessionState.data,
}));

const revokePushForSessionEnd = vi.fn(async () => "not-subscribed" as const);
vi.mock("@/lib/push/revoke", () => ({
  revokePushForSessionEnd: () => revokePushForSessionEnd(),
  pushCleanupNeedsWarning: () => false,
  PUSH_SUBSCRIPTION_ID_KEY: "bcc-push-subscription-id",
  rememberPushSubscriptionId: vi.fn(),
}));

import { PrivateRenderGate } from "@/components/auth/PrivateRenderGate";
import { SessionBoundaryBridge } from "@/components/auth/SessionBoundaryBridge";
import { __resetSessionBoundaryForTests } from "@/lib/auth/session-boundary";

/**
 * Stands in for the real private surfaces that hold unserialisable state:
 * in-progress text plus an attachment that exists only as a File handle.
 */
function Editor() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<string | null>(null);
  return (
    <div>
      <input
        data-testid="draft"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <button
        data-testid="attach"
        type="button"
        onClick={() => {
          setFile("photo.png");
        }}
      >
        attach
      </button>
      <span data-testid="attached">{file ?? "(none)"}</span>
    </div>
  );
}

function PrivateReadout() {
  const { data } = useQuery<{ secret: string }>({
    queryKey: ["user", "viewer-a"],
    queryFn: () => new Promise(() => {}) as Promise<{ secret: string }>,
    enabled: false,
  });
  return <div data-testid="private">{data?.secret ?? "(none)"}</div>;
}

let qc: QueryClient;

function tree() {
  return (
    <QueryClientProvider client={qc}>
      <SessionBoundaryBridge />
      <PrivateRenderGate>
        <PrivateReadout />
        <Editor />
      </PrivateRenderGate>
    </QueryClientProvider>
  );
}

const unreadable = () =>
  vi.fn(async () => new Response("<html/>", { status: 502 }));

const sessionFor = (id: string) =>
  new Response(JSON.stringify({ user: { id }, expires: "2099-01-01" }), {
    status: 200,
  });

function stubLocation() {
  const reload = vi.fn();
  const assign = vi.fn();
  Object.defineProperty(window, "location", {
    value: { reload, assign, href: "http://localhost/", pathname: "/" },
    writable: true,
  });
  return { reload, assign };
}

const shield = () => document.querySelector("[data-private-shield]");
const retry = () => screen.getByRole("button", { name: /retry|try again/i });

beforeEach(() => {
  __resetSessionBoundaryForTests();
  signOut.mockClear();
  signOut.mockImplementation(async () => undefined);
  revokePushForSessionEnd.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  sessionState.data = { user: { id: "a" } };
  sessionState.status = "authenticated";
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
  __resetSessionBoundaryForTests();
});

/** Drive the bridge to the give-up state with unreadable reads. */
async function reachUnknown(view: ReturnType<typeof render>) {
  sessionState.data = null;
  sessionState.status = "unauthenticated";
  view.rerender(tree());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
}

describe("session unknown — nothing is destroyed", () => {
  it("keeps the editor mounted with its draft and attachment intact", async () => {
    vi.useFakeTimers();
    stubLocation();
    vi.stubGlobal("fetch", unreadable());

    const view = render(tree());
    fireEvent.change(screen.getByTestId("draft"), {
      target: { value: "half a post" },
    });
    fireEvent.click(screen.getByTestId("attach"));

    await reachUnknown(view);

    // Still in the DOM rather than swapped for a placeholder, so React
    // state, the File handle and the blob URL all survive.
    expect(screen.getByTestId("draft")).toHaveValue("half a post");
    expect(screen.getByTestId("attached")).toHaveTextContent("photo.png");
  });

  it("clears no storage and navigates nowhere", async () => {
    vi.useFakeTimers();
    const { reload, assign } = stubLocation();
    vi.stubGlobal("fetch", unreadable());
    window.localStorage.setItem("bcc.blog.draft.a", "half-written post");
    window.localStorage.setItem("bcc-recent-searches", '["acme payroll"]');

    const view = render(tree());
    await reachUnknown(view);

    expect(window.localStorage.getItem("bcc.blog.draft.a")).toBe("half-written post");
    expect(window.localStorage.getItem("bcc-recent-searches")).toBe('["acme payroll"]');
    expect(reload).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("session unknown — nothing private is readable or reachable", () => {
  it("hides and disables the subtree", async () => {
    vi.useFakeTimers();
    stubLocation();
    vi.stubGlobal("fetch", unreadable());

    const view = render(tree());
    await reachUnknown(view);

    const el = shield();
    expect(el).not.toBeNull();
    // Not merely transparent or off-screen: nothing of it is rendered,
    // it is removed from the accessibility tree, and `inert` stops focus
    // and pointer interaction reaching it.
    expect((el as HTMLElement).style.display).toBe("none");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveAttribute("inert");
  });

  it("explains itself accessibly, and says the work is safe", async () => {
    vi.useFakeTimers();
    stubLocation();
    vi.stubGlobal("fetch", unreadable());

    const view = render(tree());
    await reachUnknown(view);

    const alert = screen.getByRole("alert");
    const copy = alert.textContent ?? "";
    expect(copy).toMatch(/couldn’t reach|can’t reach/i);
    // Telling someone their work is safe is the difference between this
    // and a frightening blank screen.
    expect(copy).toMatch(/nothing you were writing|has not been lost/i);
    expect(retry()).toBeInTheDocument();
  });
});

describe("session unknown — reopening", () => {
  it("reopens on a readable response confirming the SAME viewer, latest input kept", async () => {
    vi.useFakeTimers();
    stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    fireEvent.change(screen.getByTestId("draft"), {
      target: { value: "half a post" },
    });
    await reachUnknown(view);

    // A keystroke that lands WHILE hidden must survive too.
    fireEvent.change(screen.getByTestId("draft"), {
      target: { value: "half a post, plus more" },
    });

    fetchMock.mockImplementation(async () => sessionFor("a"));
    await act(async () => {
      fireEvent.click(retry());
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(shield()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("draft")).toHaveValue("half a post, plus more");
    expect(screen.getByTestId("private")).toBeInTheDocument();
  });

  it("stays hidden, with Retry still available, while reads remain unreadable", async () => {
    vi.useFakeTimers();
    stubLocation();
    vi.stubGlobal("fetch", unreadable());

    const view = render(tree());
    fireEvent.change(screen.getByTestId("draft"), {
      target: { value: "half a post" },
    });
    await reachUnknown(view);

    await act(async () => {
      fireEvent.click(retry());
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(shield()).not.toBeNull();
    expect(retry()).toBeInTheDocument();
    expect(screen.getByTestId("draft")).toHaveValue("half a post");
  });
});

describe("session unknown — a verdict takes over", () => {
  it("departs when Retry finds a DIFFERENT viewer", async () => {
    vi.useFakeTimers();
    const { reload } = stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await reachUnknown(view);

    fetchMock.mockImplementation(async () => sessionFor("b"));
    await act(async () => {
      fireEvent.click(retry());
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("departs when Retry finds the session gone", async () => {
    vi.useFakeTimers();
    const { reload } = stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await reachUnknown(view);

    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await act(async () => {
      fireEvent.click(retry());
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("departs without the unknown panel lingering", async () => {
    // The departure gate owns the screen once a verdict lands.
    vi.useFakeTimers();
    stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await reachUnknown(view);

    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await act(async () => {
      fireEvent.click(retry());
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.queryByRole("button", { name: /retry|try again/i })).toBeNull();
  });
});
