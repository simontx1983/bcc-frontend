/**
 * An unusable attestation target id must produce NO request.
 *
 * ## The defect this pins
 *
 * `MemberProfile.user_id` is typed `number`, but it arrives as JSON at
 * runtime — so an absent or renamed field reaches this code as `undefined`
 * with no type error anywhere. The profile page's SSR roster seed
 * interpolated it straight into the path, and a recording API stub caught
 * the result verbatim:
 *
 *     GET entities/user_profile/undefined/attestations?include_revoked=1
 *
 * A guaranteed 404, and worse, it was the ANONYMOUS token-less read — so
 * the 404 cached under that key in the shared Data Cache that every
 * crawler and logged-out visitor is served from.
 *
 * The client hook was never affected: `useAttestationRoster` already gates
 * `enabled` on `targetId !== undefined && targetId > 0`. The gap was the
 * server-side seed only. The guard lives in the shared path builder so it
 * covers every caller, present and future, rather than one call site.
 *
 * ## Why the control cases are here
 *
 * "No request for a bad id" passes just as well against a function that
 * never requests anything. So a valid id is asserted to still fetch, with
 * the exact path, in the same file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("next-auth/react", () => ({
  getSession: async () => null,
}));

import {
  InvalidAttestationTargetError,
  getAttestationRoster,
  getAttestationRosterAnon,
} from "@/lib/api/attestations-endpoints";

const ROSTER = {
  items: [],
  summary: { vouch_count: 0, stand_behind_count: 0 },
  pagination: { page: 1, per_page: 20, total_pages: 1, has_more: false },
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify({ data: body, _meta: {} }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse(ROSTER));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Every value that must never reach the URL. */
const UNUSABLE: Array<[string, unknown]> = [
  ["undefined", undefined],
  ["null", null],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["zero", 0],
  ["negative", -7],
  ["fractional", 1.5],
  ["numeric string", "1001"],
  ["empty string", ""],
  ["object", {}],
];

describe("an unusable target id issues no request", () => {
  for (const [label, value] of UNUSABLE) {
    it(`refuses the ANONYMOUS server read for ${label}`, async () => {
      await expect(
        getAttestationRosterAnon(
          "user_profile",
          value as number,
          { include_revoked: true },
          60,
        ),
      ).rejects.toBeInstanceOf(InvalidAttestationTargetError);

      // The assertion that matters: nothing went to the network, so
      // nothing can 404 and nothing can poison the shared Data Cache.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it(`refuses the client read for ${label}`, async () => {
      await expect(
        getAttestationRoster("user_profile", value as number),
      ).rejects.toBeInstanceOf(InvalidAttestationTargetError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("never lets the literal string 'undefined' into a path", async () => {
    await getAttestationRosterAnon(
      "user_profile",
      undefined as unknown as number,
      {},
    ).catch(() => undefined);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes("undefined"))).toHaveLength(0);
  });
});

describe("controls — a valid id still fetches, with the right path", () => {
  it("performs the anonymous server read for a positive integer", async () => {
    const out = await getAttestationRosterAnon(
      "user_profile",
      1001,
      { include_revoked: true },
      60,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("entities/user_profile/1001/attestations");
    expect(url).toContain("include_revoked=1");
    expect(out).toEqual(ROSTER);
  });

  it("performs the client read for a positive integer", async () => {
    await getAttestationRoster("user_profile", 42);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "entities/user_profile/42/attestations",
    );
  });

  it("accepts a large safe integer", async () => {
    await getAttestationRoster("user_profile", Number.MAX_SAFE_INTEGER);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects beyond the safe-integer range rather than rounding it", async () => {
    // Number.MAX_SAFE_INTEGER + 2 is representable but no longer exact;
    // stringifying it would request a row id the caller never meant.
    await expect(
      getAttestationRoster("user_profile", Number.MAX_SAFE_INTEGER + 2),
    ).rejects.toBeInstanceOf(InvalidAttestationTargetError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the refusal is distinguishable from a transport failure", () => {
  it("throws a named error type, not a bare Error", async () => {
    // The profile page swallows roster failures on purpose. A caller that
    // wants to tell "bad id" from "server down" needs the type to say so.
    const err = await getAttestationRoster(
      "user_profile",
      undefined as unknown as number,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvalidAttestationTargetError);
    expect((err as InvalidAttestationTargetError).name).toBe(
      "InvalidAttestationTargetError",
    );
    expect((err as InvalidAttestationTargetError).targetKind).toBe(
      "user_profile",
    );
  });
});
