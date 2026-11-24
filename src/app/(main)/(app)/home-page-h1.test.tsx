/**
 * F-565 (testnet audit): the home page (the Floor) had no <h1>. The design
 * has no visible title, so the heading is for screen readers only. The page
 * is a server component, so this walks the element tree it returns.
 */

import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("@/lib/api/user-endpoints", () => ({ getUser: vi.fn() }));
vi.mock("@/components/composer/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/feed/FeedView", () => ({ FeedView: () => null }));
vi.mock("@/components/landing/FloorBriefing", () => ({ FloorBriefing: () => null }));
vi.mock("@/components/onboarding/ResumeOnboardingPrompt", () => ({ ResumeOnboardingPrompt: () => null }));
vi.mock("@/components/tour/TourAutoStart", () => ({ TourAutoStart: () => null }));

import HomePage from "./page";

/** Every plain <h1> element in a returned tree. */
function h1s(node: ReactNode): Array<{ props: Record<string, unknown> }> {
  const out: Array<{ props: Record<string, unknown> }> = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!isValidElement(n)) return;
    const props = n.props as Record<string, unknown>;
    if (n.type === "h1") out.push({ props });
    walk(props["children"]);
  };
  walk(node);
  return out;
}

describe("home page heading", () => {
  it("has exactly one <h1>, visually hidden, naming the Floor", async () => {
    const tree = await HomePage({ searchParams: Promise.resolve({}) });
    const found = h1s(tree);
    expect(found).toHaveLength(1);
    expect(found[0]?.props["className"]).toBe("sr-only");
    expect(found[0]?.props["children"]).toBe("The Floor");
  });
});
