/**
 * The claim journey's structural guarantees, moved here from
 * lib/wallet/claim-support.test.ts when F-552 deleted that module (the
 * client chain allowlist). Only the two allowlist tests were dropped:
 * claimability is now the server's answer (claim-claimability-f552.test.tsx).
 *
 * Source-reading assertions, the house idiom for structural guarantees
 * (see claim-chain-authority.test.ts for why ClaimFlow isn't rendered).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const uncommented = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");

describe("the claim journey", () => {
  const flow = read("src/components/claim/ClaimFlow.tsx");
  const callout = read("src/components/claim/ClaimCallout.tsx");

  it("carries on to the claim when the wallet is already linked", () => {
    const at = flow.indexOf("await linkOrConfirmOwnWallet(");
    expect(at).toBeGreaterThan(-1);
    expect(flow.slice(at)).toMatch(/await claimPage\(/);
  });

  it("does not name one wallet when the chain decides which one", () => {
    expect(flow).not.toContain("SIGN WITH KEPLR");
  });

  it("gives anonymous viewers a working way in, back to this page", () => {
    expect(callout).toContain("/login?callbackUrl=${encodeURIComponent(pathname)}");
    expect(callout).toContain('href="/signup"');
  });

  it("does not use threatening wording on an unclaimed page", () => {
    expect(uncommented(callout)).not.toContain("WANTED");
    expect(uncommented(read("src/components/entity/EntityProfile.tsx"))).not.toContain("WANTED");
  });
});
