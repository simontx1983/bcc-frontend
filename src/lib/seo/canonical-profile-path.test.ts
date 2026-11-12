import { describe, expect, it } from "vitest";

import { canonicalProfilePath } from "@/lib/seo/canonical-profile-path";

describe("canonicalProfilePath", () => {
  it("renders in place when the URL already uses the current handle", () => {
    expect(canonicalProfilePath("alice", "alice")).toBeNull();
  });

  it("a case-only difference is not worth a redirect hop", () => {
    expect(canonicalProfilePath("Alice", "alice")).toBeNull();
    expect(canonicalProfilePath("alice", "ALICE")).toBeNull();
  });

  it("a still-encoded segment is compared decoded, so it never loops", () => {
    expect(canonicalProfilePath("al%2Dice", "al-ice")).toBeNull();
  });

  it("a retired handle redirects to the current one", () => {
    expect(canonicalProfilePath("alice_login", "alice")).toBe("/u/alice");
  });

  it("member-{id} redirects to the stored handle", () => {
    expect(canonicalProfilePath("member-42", "welder")).toBe("/u/welder");
  });

  it("keeps the whole query, repeated keys included", () => {
    expect(canonicalProfilePath("old", "new", { tab: "profile", focus: "bio" })).toBe(
      "/u/new?tab=profile&focus=bio",
    );
    expect(canonicalProfilePath("old", "new", { k: ["a", "b"], skip: undefined })).toBe(
      "/u/new?k=a&k=b",
    );
  });

  it("encodes the target handle", () => {
    expect(canonicalProfilePath("old", "a b")).toBe("/u/a%20b");
  });

  it("an empty current handle never redirects", () => {
    expect(canonicalProfilePath("old", "")).toBeNull();
  });

  it("a malformed escape in the URL is compared as-is, not thrown", () => {
    expect(canonicalProfilePath("bad%E0", "alice")).toBe("/u/alice");
  });
});
