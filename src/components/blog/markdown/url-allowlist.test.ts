import { describe, expect, it } from "vitest";

import { internalPathOf, isInternalPath, safeUrlTransform } from "./url-allowlist";

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

  it("passes protocol-relative URLs through unchanged (contract: '' only for disallowed schemes)", () => {
    // Scheme-less, so not a scheme decision; isInternalPath below is what
    // keeps it from being treated as an on-site link.
    expect(safeUrlTransform("//evil.example")).toBe("//evil.example");
  });
});

describe("isInternalPath", () => {
  it("accepts root-relative paths on this site", () => {
    expect(isInternalPath("/u/phillip")).toBe(true);
    expect(isInternalPath("/")).toBe(true);
    expect(isInternalPath("/post/abc?x=1#y")).toBe(true);
  });

  it("rejects protocol-relative and backslash host forms", () => {
    expect(isInternalPath("//evil.example")).toBe(false);
    expect(isInternalPath("//evil.example/u/phillip")).toBe(false);
    expect(isInternalPath("/\\evil.example")).toBe(false);
  });

  it("rejects absolute, fragment, query and dot-relative URLs", () => {
    expect(isInternalPath("https://example.com/x")).toBe(false);
    expect(isInternalPath("#section")).toBe(false);
    expect(isInternalPath("?tab=blog")).toBe(false);
    expect(isInternalPath("./relative/path")).toBe(false);
    expect(isInternalPath("")).toBe(false);
  });

  // Review M1 on #222: browsers strip TAB, LF and CR anywhere in a URL, so
  // these become "//evil.com" and leave the site. A raw-string regex
  // passed all three as internal.
  it.each([
    ["TAB between the slashes", "/\t/evil.com"],
    ["LF between the slashes", "/\n/evil.com"],
    ["CR between the slashes", "/\r/evil.com"],
    ["protocol-relative (control)", "//evil.com"],
    ["slash-backslash (control)", "/\\evil.com"],
  ])("rejects %s", (_label, url) => {
    expect(isInternalPath(url)).toBe(false);
    expect(internalPathOf(url)).toBeNull();
  });

  it("returns the RESOLVED same-site path, which is what gets rendered", () => {
    expect(internalPathOf("/u/phillip")).toBe("/u/phillip");
    expect(internalPathOf("/post/abc?x=1#y")).toBe("/post/abc?x=1#y");
    expect(internalPathOf("/a/../b")).toBe("/b");
    // Whitespace the browser would strip is gone from what we render.
    expect(internalPathOf("/u/\tphillip")).toBe("/u/phillip");
  });
});
