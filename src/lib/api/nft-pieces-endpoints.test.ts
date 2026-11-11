/**
 * getNftPiece must not let the page's `?chain=` / `&contract=` query
 * steer the server-side fetch (which carries the viewer's bearer token)
 * to another `/wp-json` route.
 *
 * Before: chain and contract were interpolated raw into the path, so a
 * crafted link like `?chain=../users/me&contract=x` reached a different
 * route. Encoding alone would not close it: encodeURIComponent leaves
 * `.` alone, so a segment of exactly `..` still climbs a level.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const bccFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  bccFetch: (...a: unknown[]) => bccFetch(...a),
}));

const { getNftPiece, isValidNftPieceRef } = await import("@/lib/api/nft-pieces-endpoints");
const { BccApiError } = await import("@/lib/api/types");

beforeEach(() => {
  bccFetch.mockReset();
  bccFetch.mockResolvedValue({});
});

const pathOf = () => bccFetch.mock.calls[0]?.[0] as string;

describe("getNftPiece — valid references", () => {
  it("builds the path from canonical parts", async () => {
    await getNftPiece("stargaze", "stars1abc123", "42", "tok");
    expect(pathOf()).toBe("nft-pieces/stargaze/stars1abc123/42");
  });

  it("accepts an EVM contract and keeps encoding a CW-721 token id with a slash", async () => {
    await getNftPiece("ethereum", "0xAbC123", "a/b c", null);
    expect(pathOf()).toBe("nft-pieces/ethereum/0xAbC123/a%2Fb%20c");
  });
});

describe("getNftPiece — crafted references never reach the network", () => {
  const BAD: Array<[string, string, string, string]> = [
    ["chain with a traversal", "../users/me", "stars1abc", "1"],
    ["chain with a slash", "stargaze/x", "stars1abc", "1"],
    ["uppercase chain", "Stargaze", "stars1abc", "1"],
    ["chain with a query", "stargaze?x=1", "stars1abc", "1"],
    ["contract that is ..", "stargaze", "..", "1"],
    ["contract with a slash", "stargaze", "stars1/../../me", "1"],
    ["contract with a percent", "stargaze", "stars%2F", "1"],
    ["token id that is ..", "stargaze", "stars1abc", ".."],
    ["token id that is .", "stargaze", "stars1abc", "."],
    ["empty token id", "stargaze", "stars1abc", ""],
  ];

  for (const [label, chain, contract, token] of BAD) {
    it(`refuses a ${label}`, async () => {
      expect(isValidNftPieceRef(chain, contract, token)).toBe(false);
      const err = await getNftPiece(chain, contract, token, "tok").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BccApiError);
      expect((err as InstanceType<typeof BccApiError>).code).toBe("bcc_invalid_request");
      expect(bccFetch).not.toHaveBeenCalled();
    });
  }
});
