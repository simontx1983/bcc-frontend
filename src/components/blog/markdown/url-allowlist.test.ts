import { describe, expect, it } from "vitest";

import { safeUrlTransform } from "./url-allowlist";

/**
 * Audit F4: the blog renderer's link/image URL safety must be an explicit,
 * regression-proof allowlist — not an implicit reliance on react-markdown's
 * default. A change that lets a `javascript:` / `data:` URL through (e.g. a
 * careless `ipfs:` addition that widens the matcher) must turn this suite red.
 */
describe("safeUrlTransform", () => {
  it("keeps the allowlisted schemes", () => {
    expect(safeUrlTransform("https://example.com/x")).toBe(
      "https://example.com/x"
    );
    expect(safeUrlTransform("http://example.com")).toBe("http://example.com");
    expect(safeUrlTransform("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("keeps relative / fragment / query URLs (internal links + anchors)", () => {
    expect(safeUrlTransform("/u/phillip")).toBe("/u/phillip");
    expect(safeUrlTransform("#section")).toBe("#section");
    expect(safeUrlTransform("?tab=blog")).toBe("?tab=blog");
    expect(safeUrlTransform("./relative/path")).toBe("./relative/path");
  });

  it("drops dangerous schemes", () => {
    expect(safeUrlTransform("javascript:alert(1)")).toBe("");
    expect(safeUrlTransform("data:text/html,<script>alert(1)</script>")).toBe(
      ""
    );
    expect(safeUrlTransform("vbscript:msgbox(1)")).toBe("");
  });

  it("drops obfuscated javascript: (case / whitespace) — defence in depth", () => {
    expect(safeUrlTransform("JaVaScRiPt:alert(1)")).toBe("");
    expect(safeUrlTransform("  javascript:alert(1)")).toBe("");
  });

  it("drops schemes outside the allowlist even if otherwise harmless", () => {
    // Not in the allowlist today — adding ipfs: must be a deliberate edit.
    expect(safeUrlTransform("ipfs://Qm123")).toBe("");
    expect(safeUrlTransform("ftp://example.com")).toBe("");
  });
});
