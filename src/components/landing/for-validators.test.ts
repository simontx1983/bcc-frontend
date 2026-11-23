/**
 * The For Validators landing page's guarantees, moved here from
 * lib/wallet/claim-support.test.ts when F-552 deleted that module. The
 * page no longer lists chains (claimability is the server's answer, shown
 * on each validator's page), so only the chain-list tests were dropped.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

describe("the for-validators page", () => {
  const page = read("src/components/landing/ForValidators.tsx").replace(/\/\*[\s\S]*?\*\//g, "");

  it("explains the claim and never starts one: no wallet connect or signature here", () => {
    expect(page).not.toMatch(/lib\/wallet\/(dispatch|keplr|metamask|phantom|polkadot|linkFlow)/);
    expect(page).not.toContain("ClaimFlow");
    expect(page).not.toContain("connectWallet");
  });

  it("shows the exact prompt the wallet will ask the operator to sign", () => {
    const prose = page.replace(/\s+/g, " ");
    expect(prose).toContain("Sign this message to verify your wallet on Blue Collar Crypto. Nonce: ");
  });

  it("does not pressure the operator with people waiting", () => {
    expect(page).not.toMatch(/already (following|messag)|people are waiting|waiting for you/i);
  });

  it("promises only what a claim gives today", () => {
    const prose = page.replace(/\s+/g, " ");
    expect(prose).not.toMatch(/post as your validator|operator badge|operator bonus|your inbox|your dashboard|community|communities|delegator group/i);
    expect(prose).toContain("publish announcements");
  });

  it("names the city, never the street address", () => {
    expect(page).toContain("Fort Worth, Texas");
    expect(page).not.toContain("LEGAL.address");
    expect(page).not.toContain("Ranch Road");
  });

  it("serves the headshot with no EXIF or XMP metadata", async () => {
    const { default: sharp } = await import("sharp");
    const meta = await sharp(resolve(process.cwd(), "public/images/team/phillip-s.jpg")).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("states no weights, multipliers or formulas", () => {
    expect(page).not.toMatch(/\b(weight|multiplier|formula)\b/i);
  });
});
