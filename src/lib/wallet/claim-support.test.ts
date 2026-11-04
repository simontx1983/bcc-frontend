import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isChainClaimable, unsupportedClaimReason } from "@/lib/wallet/claim-support";
import { VALIDATOR_CHAIN_CATALOG } from "@/lib/validators/chain-catalog";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

describe("isChainClaimable", () => {
  it.each(["cosmos", "osmosis", "juno", "injective", "polkadot", "akash", "cryptoorgchain", "jackal", "dungeon"])(
    "%s can be claimed",
    (slug) => expect(isChainClaimable(slug)).toBe(true),
  );

  // thorchain is linkable but stores the node address; kujira has no verified
  // Keplr chain id; the rest can't prove operator authority at all.
  it.each(["thorchain", "kujira", "solana", "near", "ethereum", "not-a-chain"])(
    "%s cannot be claimed",
    (slug) => expect(isChainClaimable(slug)).toBe(false),
  );

  it("gives every indexed chain an answer on one side or the other", () => {
    const yes = VALIDATOR_CHAIN_CATALOG.filter((c) => isChainClaimable(c.slug));
    const no = VALIDATOR_CHAIN_CATALOG.filter((c) => !isChainClaimable(c.slug));

    expect(yes.length).toBeGreaterThan(0);
    expect(no.map((c) => c.slug).sort()).toEqual(["kujira", "near", "solana", "thorchain"]);
  });

  it("never tells an operator the wallet side works when it doesn't", () => {
    expect(unsupportedClaimReason("kujira")).not.toMatch(/wallet side works/i);
  });
});

describe("claim journey", () => {
  const flow = read("src/components/claim/ClaimFlow.tsx");
  const callout = read("src/components/claim/ClaimCallout.tsx");

  it("carries on to the claim when the wallet is already linked", () => {
    const at = flow.indexOf('isCode(linkErr, "bcc_conflict")');
    expect(at).toBeGreaterThan(-1);
    // The link failure must not throw for a conflict, and claim must follow it.
    expect(flow.slice(at)).toMatch(/alreadyLinked = true[\s\S]*await claimPage\(/);
  });

  it("does not name one wallet on a flow used by several", () => {
    expect(flow).not.toContain("SIGN WITH KEPLR");
  });

  it("gives anonymous viewers a working way in, back to this page", () => {
    expect(callout).toContain("/login?callbackUrl=${encodeURIComponent(pathname)}");
    expect(callout).toContain('href="/signup"');
  });

  it("says a chain can't be claimed before anyone makes an account", () => {
    expect(callout).toContain("unsupportedClaimReason(target.chain_slug)");
  });

  it("does not use threatening wording on a page the operator may arrive at cold", () => {
    const entity = read("src/components/entity/EntityProfile.tsx");
    const uncommented = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");

    expect(uncommented(callout)).not.toContain("WANTED");
    expect(uncommented(entity)).not.toContain("WANTED");
  });
});

describe("the for-validators page", () => {
  // Comments explain what this page must not do, so assert on the code alone.
  const page = read("src/components/landing/ForValidators.tsx").replace(/\/\*[\s\S]*?\*\//g, "");

  it("requests no wallet connection or signature itself", () => {
    expect(page).not.toMatch(/lib\/wallet\/(dispatch|keplr|metamask|phantom|polkadot|linkFlow)/);
    expect(page).not.toContain("ClaimFlow");
    expect(page).not.toContain("connectWallet");
  });

  it("prints the wallet prompt word for word with bcc-core's WalletChallenge::PREFIX", () => {
    const prose = page.replace(/\s+/g, " ");
    expect(prose).toContain("Sign this message to verify your wallet on Blue Collar Crypto. Nonce: ");
  });

  it("does not claim people are already waiting", () => {
    expect(page).not.toMatch(/already (following|messag)|people are waiting|waiting for you/i);
  });

  it("shows the city, not the street address in legal config", () => {
    expect(page).toContain("Fort Worth, Texas");
    expect(page).not.toContain("LEGAL.address");
    expect(page).not.toContain("Ranch Road");
  });

  it("ships a headshot with no EXIF, because phone photos can carry GPS", async () => {
    const { default: sharp } = await import("sharp");
    const meta = await sharp(resolve(process.cwd(), "public/images/team/phillip-s.jpg")).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("does not expose scoring weights", () => {
    expect(page).not.toMatch(/\b(weight|multiplier|formula)\b/i);
  });
});
