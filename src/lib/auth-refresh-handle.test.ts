/**
 * F-333 — after a handle change the session's handle is refreshed from the
 * SERVER, never from the client.
 *
 * `update({ refreshHandle: true })` makes the jwt callback read
 * GET /auth/session with the session's own bearer, and adopt the handle
 * only when the answer belongs to this session's user. A handle the client
 * puts in the update body is ignored, as before — this seam must not be
 * able to forge identity.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
  serverEnv: { BCC_OAUTH_BRIDGE_SECRET: "test-secret" },
}));

const { authOptions } = await import("@/lib/auth");

type Cb = (a: Record<string, unknown>) => Promise<{ id?: unknown; handle?: unknown }>;
const jwt = () => authOptions.callbacks?.jwt as unknown as Cb;

const fetchMock = vi.fn();
const sessionReply = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ data, _meta: { version: "v1" } }), { status });

const TOKEN = () => ({
  id: "7",
  handle: "old-name",
  bccToken: "tok-7",
  bccTokenExpiresAt: Date.now() + 3_600_000,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("jwt update — refreshHandle", () => {
  it("adopts the server's current handle, read with the session's own token", async () => {
    fetchMock.mockResolvedValue(sessionReply({ user_id: 7, handle: "new-name" }));
    const out = await jwt()({ token: TOKEN(), trigger: "update", session: { refreshHandle: true } });

    expect(out.handle).toBe("new-name");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wp.example/wp-json/bcc/v1/auth/session");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok-7");
  });

  it("ignores an answer for a different user", async () => {
    fetchMock.mockResolvedValue(sessionReply({ user_id: 8, handle: "someone-else" }));
    const out = await jwt()({ token: TOKEN(), trigger: "update", session: { refreshHandle: true } });
    expect(out.handle).toBe("old-name");
  });

  it("keeps the old handle when the read fails", async () => {
    fetchMock.mockResolvedValue(sessionReply({}, 401));
    const out = await jwt()({ token: TOKEN(), trigger: "update", session: { refreshHandle: true } });
    expect(out.handle).toBe("old-name");
  });

  it("never takes a handle from the client", async () => {
    const out = await jwt()({
      token: TOKEN(),
      trigger: "update",
      session: { handle: "forged", id: "1" },
    });
    expect(out.handle).toBe("old-name");
    expect(out.id).toBe("7");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a client handle alongside refreshHandle is still ignored; the server's wins", async () => {
    fetchMock.mockResolvedValue(sessionReply({ user_id: 7, handle: "new-name" }));
    const out = await jwt()({
      token: TOKEN(),
      trigger: "update",
      session: { refreshHandle: true, handle: "forged" },
    });
    expect(out.handle).toBe("new-name");
  });
});
