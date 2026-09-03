/**
 * The Community Access panel must agree with the navigation that opened it.
 *
 * The settings regrouping renamed the visible navigation entry to
 * COMMUNITY ACCESS — the profile's list of communities you already belong to
 * is a different job from eligibility for gated ones, and one word was doing
 * both. The panel's own eyebrow was left reading COMMUNITIES, so an operator
 * clicking "Community Access" arrived at a section that identified itself by
 * the old name. A section identifier that disagrees with the control that
 * opened it makes a person doubt they landed in the right place.
 *
 * Only the user-facing eyebrow changed. The `communities` key, the endpoint,
 * the component name and the API concept are all untouched — this is
 * orientation, not a vocabulary sweep.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
// The list is a network surface; this file is about the heading.
vi.mock("@/components/settings/CommunitiesList", () => ({
  CommunitiesList: () => <div data-testid="communities-list" />,
}));

import { CommunitiesSettingsPanel } from "@/components/profile/panels/settings/CommunitiesSettingsPanel";

afterEach(cleanup);

describe("the Community Access panel identifies itself correctly", () => {
  it("its section eyebrow matches the navigation entry", () => {
    render(<CommunitiesSettingsPanel />);
    expect(screen.getByText("COMMUNITY ACCESS")).toBeDefined();
  });

  it("no longer identifies itself as COMMUNITIES", () => {
    render(<CommunitiesSettingsPanel />);
    // Scoped to an exact-match text node: the blurb legitimately contains the
    // word "Communities" in a sentence, and that copy is deliberately kept.
    expect(screen.queryByText("COMMUNITIES")).toBeNull();
  });

  it("KEEPS the explanation of what can be unlocked", () => {
    // The rename must not cost the operator the one sentence that says what
    // this section actually does.
    render(<CommunitiesSettingsPanel />);
    expect(screen.getByText(/unlock by holding the right NFT/i)).toBeDefined();
    expect(screen.getByText(/Eligibility re-checks at join time/i)).toBeDefined();
    expect(screen.getByText("NFT-gated communities")).toBeDefined();
  });

  it("renames NOTHING but the visible label", () => {
    // The key, endpoint and component are the contract; only the eyebrow is
    // presentation. A rename that reached the key would break `?tab=communities`
    // and eight redirects at once.
    const src = readFileSync(
      resolve(process.cwd(), "src/components/profile/panels/settings/CommunitiesSettingsPanel.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/export function CommunitiesSettingsPanel/);
    expect(src).toMatch(/from "@\/components\/settings\/CommunitiesList"/);
    expect(src, "the key must never be renamed").not.toMatch(/community-access|communityAccess/);
  });

  it("still renders the list it is a wrapper for", () => {
    render(<CommunitiesSettingsPanel />);
    expect(screen.getByTestId("communities-list")).toBeDefined();
  });
});
