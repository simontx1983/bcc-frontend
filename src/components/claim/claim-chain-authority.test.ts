/**
 * Claim authority is per chain, and the wallet-link bundle must carry
 * `extra` — the two properties that decide whether a validator claim can
 * succeed at all.
 *
 * Source-reading assertions (the house idiom for structural guarantees,
 * see app/phosphor-confinement.test.ts): ClaimFlow is a four-step modal
 * driven by live wallet providers, so rendering it in jsdom would prove
 * far less than pinning the decisions it encodes.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/**
 * Slice one top-level `function NAME(` out of a module so an assertion
 * cannot be satisfied by a match somewhere else in the file.
 *
 * Added after a measured false green: an earlier version of the
 * "no retry" test asserted a lazy pattern against the WHOLE module, and
 * deleting the guard inside ConnectStep still passed — the match ran
 * from the identically-worded guard in `handleConnect` to a later
 * `CLOSE`. Scope the text, then assert.
 */
function fn(src: string, name: string): string {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) {
    throw new Error("function " + name + " not found");
  }
  const next = src.indexOf("\nfunction ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

const CLAIM_FLOW = "src/components/claim/ClaimFlow.tsx";
const DASHBOARD = "src/app/(main)/(app)/me/validator-pages/page.tsx";

/** Strip comments so prose can never satisfy a code assertion. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");
}

describe("validator claim — chain authority", () => {
  it("has the files under test", () => {
    expect(read(CLAIM_FLOW).length).toBeGreaterThan(0);
    expect(read(DASHBOARD).length).toBeGreaterThan(0);
  });

  it("allows exactly the chain types whose operator authority the backend can prove", () => {
    const src = code(read(CLAIM_FLOW));

    // cosmos: bech32 bytes. polkadot: the stash account.
    expect(src).toContain('"cosmos"');
    expect(src).toContain('"polkadot"');
    expect(src).toContain("CLAIMABLE_CHAIN_TYPES");

    // The allowlist literal itself must not admit solana or evm.
    const listMatch = /CLAIMABLE_CHAIN_TYPES[^=]*=\s*new Set<WalletChainType>\(\[([^\]]*)\]\)/.exec(src);
    expect(listMatch).not.toBeNull();
    const list = listMatch?.[1] ?? "";
    expect(list).toContain("cosmos");
    expect(list).toContain("polkadot");
    expect(list).not.toContain("solana");
    expect(list).not.toContain("evm");
  });

  it("explains WHY Solana is unavailable, so it is not 'fixed' by adding Phantom", () => {
    // Prose assertion on purpose — the reason is the safeguard here.
    const prose = read(CLAIM_FLOW);

    expect(prose).toContain("authorizedWithdrawer");
    expect(prose).toMatch(/identity key/i);
    expect(prose).toMatch(/browser wallet/i);
  });

  it("routes provider work through the shared dispatch layer, not a second copy", () => {
    const src = code(read(CLAIM_FLOW));

    expect(src).toContain('from "@/lib/wallet/dispatch"');
    expect(src).toContain("connectWallet(");
    expect(src).toContain("signWalletChallenge(");
    expect(src).toContain("walletTypeFor(");

    // No direct Keplr import — the cosmos branch lives behind dispatch.
    expect(src).not.toContain('from "@/lib/wallet/keplr"');
    expect(src).not.toContain("connectKeplr(");
    expect(src).not.toContain("signKeplrChallenge(");
  });

  /**
   * ⚠⚠ THE BUG THIS PINS. WalletAuthController builds its verification
   * `$extra` from the `extra` param ONLY — a top-level `pub_key` is never
   * bridged in. CosmosSignatureVerifier reads `$extra['pub_key']` and
   * returns false unless it decodes to a 33-byte compressed point, so a
   * link call that sent only a top-level `pub_key` could never verify a
   * Cosmos signature. Claiming was therefore impossible on every Cosmos
   * chain regardless of wallet.
   */
  it("sends the verifier bundle as `extra`, not a top-level pub_key", () => {
    const src = code(read(CLAIM_FLOW));

    expect(src).toContain("extra:          signed.extra");
    expect(src).not.toMatch(/pub_key:\s*signed\./);
  });

  it("names the right wallet per chain instead of hardcoding Keplr in copy", () => {
    const src = code(read(CLAIM_FLOW));

    // Copy is driven by walletNameFor(chainType), not a literal.
    expect(src).toContain("walletNameFor(");
    expect(src).toContain("walletName");
    // No Keplr-specific heading or button label survives in rendered copy.
    expect(src).not.toContain("Connect Keplr");
    expect(src).not.toContain("OPEN KEPLR");
    expect(src).not.toContain("RETRY KEPLR");
  });

  it("offers no retry on a chain that can never be claimed", () => {
    const whole = code(read(CLAIM_FLOW));
    const connectStep = fn(whole, "ConnectStep");

    // Scoped to ConnectStep: the early return must be IN this component.
    expect(connectStep).toContain("if (!claimable) {");
    expect(connectStep).toContain("CLOSE");

    // ...and that branch must not offer a retry that could only fail again.
    const guardAt = connectStep.indexOf("if (!claimable) {");
    const unsupported = connectStep.slice(
      guardAt,
      connectStep.indexOf("return (", guardAt + 40),
    );
    expect(unsupported).not.toContain("onRetry");
    expect(unsupported).not.toContain("PrimaryButton");

    // The flag is actually threaded in from the parent.
    expect(whole).toContain("claimable={claimable}");
  });

  it("keeps the four-step machine rather than collapsing into runLinkFlow", () => {
    const src = code(read(CLAIM_FLOW));

    expect(src).not.toContain("runLinkFlow");
    for (const step of ['"explanation"', '"connect"', '"signature"', '"confirmation"']) {
      expect(src).toContain(step);
    }
  });
});

describe("operator dashboard — no membership claim", () => {
  /**
   * `chain_reported_status` cannot establish current set membership: it
   * freezes for a validator the index fetch stops returning, and on
   * Solana `"inactive"` means PRESENT (the fetcher merges the delinquent
   * list into the active one). The dashboard must therefore never render
   * a membership badge from it.
   */
  it("renders no 'in the active set' / 'not in the current set' badge", () => {
    // Comment-stripped: the docblock explains WHY no badge is rendered, and
    // that explanation must not be what satisfies the assertion.
    const src = code(read(DASHBOARD));

    expect(src).not.toMatch(/in the active set/i);
    expect(src).not.toMatch(/not in the current set/i);
    expect(src).not.toMatch(/currently active/i);
  });

  it("labels the provider status as reported rather than current", () => {
    const src = code(read(DASHBOARD));

    expect(src).toContain("CHAIN REPORTED");
    expect(src).toContain("chain_reported_status");
  });

  it("never derives a last-seen date from fetched_at", () => {
    const src = code(read(DASHBOARD));

    expect(src).not.toContain("fetched_at");
    expect(src).not.toMatch(/last seen/i);
  });

  it("distinguishes a failed read from 'you have claimed nothing'", () => {
    const src = code(read(DASHBOARD));

    expect(src).toContain("errorMessage");
    expect(src).toContain("humanizeCode(");
    // The empty state must be reachable only when the read succeeded.
    expect(src).toMatch(/errorMessage !== null \? \([\s\S]*?\) : rows\.length === 0 \?/);
  });

  it("is signed-in only", () => {
    const src = code(read(DASHBOARD));

    expect(src).toContain("getServerSession(authOptions)");
    expect(src).toContain('redirect("/login?callbackUrl=/me/validator-pages")');
  });
});
