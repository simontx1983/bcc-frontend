/**
 * F-358 — the NextAuth jwt `update` seam adopts a replacement bearer only
 * when it belongs to THIS session's user.
 *
 * Before, `update({ bccToken })` (sent by lib/auth/session-update after a
 * refresh or a credential change) adopted any non-empty token. The client
 * already refuses another viewer's token (lib/auth/current-bearer: subject
 * + epoch); this is the server-side second layer:
 *   - a token whose subject is another user is refused — the session keeps
 *     its bearer AND its expiry;
 *   - a token older than the current one (lower token version) is refused;
 *   - an unreadable / claimless token, or a session with no user id, is
 *     refused;
 *   - the same user's token, same or newer version, is adopted with its
 *     expiry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
  serverEnv: { BCC_OAUTH_BRIDGE_SECRET: "test-secret" },
}));

const { authOptions } = await import("@/lib/auth");

type Tok = { id?: unknown; bccToken?: unknown; bccTokenExpiresAt?: unknown };
type Cb = (a: Record<string, unknown>) => Promise<Tok>;
const jwt = () => authOptions.callbacks?.jwt as unknown as Cb;

const bearer = (claims: Record<string, unknown>, sig = "s") =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${sig}`;

const CURRENT = bearer({ sub: "7", user_id: 7, tv: 2 }, "current");
const SAME_USER = bearer({ sub: "7", user_id: 7, tv: 2 }, "refreshed");
const SAME_USER_NEWER = bearer({ sub: "7", user_id: 7, tv: 3 }, "rotated");
const OTHER_USER = bearer({ sub: "8", user_id: 8, tv: 5 }, "other");
const OLDER = bearer({ sub: "7", user_id: 7, tv: 1 }, "older");

const OLD_EXPIRY = Date.now() + 3_600_000;
const NEW_EXPIRY = Date.now() + 7 * 86_400_000;

const session = (bccToken: unknown = CURRENT, id: unknown = "7") => ({
  id,
  handle: "seven",
  bccToken,
  bccTokenExpiresAt: OLD_EXPIRY,
});

const update = (token: Tok, bccToken: unknown) =>
  jwt()({ token, trigger: "update", session: { bccToken, bccTokenExpiresAt: NEW_EXPIRY } });

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("jwt update: a replacement bearer must belong to this session's user", () => {
  it("adopts the same user's refreshed token, with its expiry", async () => {
    const out = await update(session(), SAME_USER);
    expect(out.bccToken).toBe(SAME_USER);
    expect(out.bccTokenExpiresAt).toBe(NEW_EXPIRY);
  });

  it("adopts the same user's token after a credential rotation (newer version)", async () => {
    const out = await update(session(), SAME_USER_NEWER);
    expect(out.bccToken).toBe(SAME_USER_NEWER);
  });

  it("refuses another user's token and keeps the bearer and its expiry", async () => {
    const out = await update(session(), OTHER_USER);
    expect(out.bccToken).toBe(CURRENT);
    expect(out.bccTokenExpiresAt).toBe(OLD_EXPIRY);
    expect(out.id).toBe("7");
  });

  it("refuses a token older than the current one", async () => {
    const out = await update(session(), OLDER);
    expect(out.bccToken).toBe(CURRENT);
  });

  it.each([
    ["not a JWT", "tok-whatever"],
    ["no token version", bearer({ sub: "7", user_id: 7 })],
    ["subject and user id disagree", bearer({ sub: "7", user_id: 8, tv: 2 })],
  ])("refuses an unreadable candidate (%s)", async (_label, candidate) => {
    const out = await update(session(), candidate);
    expect(out.bccToken).toBe(CURRENT);
  });

  it("refuses when the session has no user id to compare against", async () => {
    const out = await update(session(CURRENT, null), SAME_USER);
    expect(out.bccToken).toBe(CURRENT);
  });

  it("checks the subject even when the current bearer is blank (expired) or unreadable", async () => {
    expect((await update(session(""), OTHER_USER)).bccToken).toBe("");
    expect((await update(session("legacy-opaque"), OTHER_USER)).bccToken).toBe("legacy-opaque");
    // ... and still lets the same user's token in there.
    expect((await update(session(""), SAME_USER)).bccToken).toBe(SAME_USER);
  });

  it("a numeric session id compares like its string form", async () => {
    const out = await update(session(CURRENT, 7), SAME_USER);
    expect(out.bccToken).toBe(SAME_USER);
  });
});
