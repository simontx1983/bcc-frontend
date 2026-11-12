/**
 * Avatar — F-187 fallback chain on the raw-<img> path (non-WP hosts: IPFS,
 * Gravatar, …), for both variants.
 *
 *   avatarUrl → (error) avatarFallbackUrl → (error) the initials monogram
 *
 * crossOrigin only when a fallback exists, as everywhere else. A WP-hosted
 * upload still goes through next/image and is untouched.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// lib/media (isWpMediaUrl) reads the API origin at import time; the same
// stub the other identity tests use. The test URLs are deliberately NOT on
// this origin, so every one takes the raw-<img> path under test.
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

import { Avatar } from "@/components/identity/Avatar";

const GATEWAY = "https://gateway.example/ipfs/bafycrest";
const IPFS_IO = "https://ipfs.io/ipfs/bafycrest";
const GRAVATAR = "https://www.gravatar.com/avatar/abc";

function img(): HTMLImageElement | null {
  return document.querySelector("img");
}

afterEach(() => {
  cleanup();
});

describe.each(["rounded", "hex"] as const)("variant %s", (variant) => {
  it("gateway → ipfs.io → initials", () => {
    render(
      <Avatar
        avatarUrl={GATEWAY}
        avatarFallbackUrl={IPFS_IO}
        handle="atlas"
        displayName="Atlas Node"
        size="md"
        variant={variant}
      />,
    );
    expect(img()?.getAttribute("src")).toBe(GATEWAY);
    expect(img()?.getAttribute("crossorigin")).toBe("anonymous");

    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe(IPFS_IO);

    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(screen.getByText("AN")).not.toBeNull();
  });

  it("no fallback: no crossorigin, and a failure still lands on initials (not a broken icon)", () => {
    render(<Avatar avatarUrl={GRAVATAR} handle="atlas" displayName="Atlas Node" size="md" variant={variant} />);
    expect(img()?.hasAttribute("crossorigin")).toBe(false);

    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(screen.getByText("AN")).not.toBeNull();
  });
});

describe("unchanged paths", () => {
  it("an empty avatarUrl still renders the monogram with no <img>", () => {
    render(<Avatar avatarUrl="" handle="atlas" displayName="Atlas Node" size="md" />);
    expect(img()).toBeNull();
    expect(screen.getByText("AN")).not.toBeNull();
  });
});
