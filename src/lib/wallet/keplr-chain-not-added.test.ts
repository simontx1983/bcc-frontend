/**
 * F-569: a chain Keplr doesn't integrate natively (Dungeon, THORChain)
 * is only known to a member's Keplr once they have added it. Until then
 * enable() fails, and the member used to see the generic "your wallet
 * couldn't finish that", a dead end. These pin what they see instead.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { WALLET_FAILED_COPY } from "@/lib/wallet/error-copy";
import {
  connectKeplr,
  KeplrChainNotAddedError,
  KeplrUserRejectedError,
} from "@/lib/wallet/keplr";

const NOT_ADDED_DUNGEON =
  "Dungeon Chain isn't added to your Keplr yet. Add it from Keplr's chain list at chains.keplr.app, then try again.";
const HEDGED_DUNGEON =
  "Couldn't connect to Dungeon Chain in Keplr. If it isn't added to your Keplr yet, add it from Keplr's chain list at chains.keplr.app, then try again.";

function keplrWhoseEnableFails(err: unknown) {
  window.keplr = {
    enable: vi.fn().mockRejectedValue(err),
    getKey: vi.fn(),
    signArbitrary: vi.fn(),
  };
}

async function connectError(slug: string): Promise<unknown> {
  try {
    await connectKeplr(slug);
  } catch (err) {
    return err;
  }
  throw new Error("connectKeplr resolved");
}

afterEach(() => {
  delete window.keplr;
});

describe("connecting Keplr to a chain the member hasn't added", () => {
  it("says so plainly when Keplr reports no chain info", async () => {
    keplrWhoseEnableFails(new Error("There is no chain info for dungeon-1"));
    const err = await connectError("dungeon");
    expect(err).toBeInstanceOf(KeplrChainNotAddedError);
    expect((err as KeplrChainNotAddedError).confirmed).toBe(true);
    expect((err as Error).message).toBe(NOT_ADDED_DUNGEON);
  });

  it("names the chain by its label (THORChain)", async () => {
    keplrWhoseEnableFails(new Error("There is no chain info for thorchain-1"));
    expect(((await connectError("thorchain")) as Error).message).toBe(
      "THORChain isn't added to your Keplr yet. Add it from Keplr's chain list at chains.keplr.app, then try again.",
    );
  });

  it("trusts Keplr's message on a native chain too", async () => {
    keplrWhoseEnableFails(new Error("There is no chain info for cosmoshub-4"));
    const err = await connectError("cosmos");
    expect(err).toBeInstanceOf(KeplrChainNotAddedError);
    expect((err as Error).message).toBe(
      "Cosmos Hub isn't added to your Keplr yet. Add it from Keplr's chain list at chains.keplr.app, then try again.",
    );
  });

  it("only offers adding the chain when a non-native connect fails for another reason", async () => {
    keplrWhoseEnableFails(new Error("Failed to fetch"));
    const err = await connectError("dungeon");
    expect(err).toBeInstanceOf(KeplrChainNotAddedError);
    expect((err as KeplrChainNotAddedError).confirmed).toBe(false);
    expect((err as Error).message).toBe(HEDGED_DUNGEON);
  });

  it("keeps a declined prompt a decline, even on a non-native chain", async () => {
    keplrWhoseEnableFails(new Error("Request rejected"));
    const err = await connectError("dungeon");
    expect(err).toBeInstanceOf(KeplrUserRejectedError);
    expect(err).not.toBeInstanceOf(KeplrChainNotAddedError);
  });

  it("leaves other failures on a native chain to the generic copy", async () => {
    keplrWhoseEnableFails(new Error("Failed to fetch"));
    const err = await connectError("cosmos");
    expect(err).not.toBeInstanceOf(KeplrChainNotAddedError);
    expect((err as Error).message).toBe(WALLET_FAILED_COPY);
  });
});
