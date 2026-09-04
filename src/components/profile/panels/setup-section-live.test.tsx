/**
 * The REAL SetupPanel, after its private destination strip was removed.
 *
 * Every ProfileTabs suite mocks this panel, which is right for testing
 * routing — but it means none of them can see whether the panel itself still
 * renders a strip. A mutation that put the old "Standing sections" tablist
 * back SURVIVED the whole suite for exactly that reason. This file renders the
 * real component so that gap is closed at the source.
 *
 * The two bodies are stubbed: they are large, data-heavy surfaces with their
 * own coverage, and what is under test here is the panel's dispatch and the
 * absence of navigation inside it.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/profile/StandingFileBody", () => ({
  StandingFileBody: ({ profile }: { profile: { handle: string } }) => (
    <div data-testid="standing-body" data-handle={profile.handle} />
  ),
}));
vi.mock("@/components/profile/ReliabilityMirrorBody", () => ({
  ReliabilityMirrorBody: ({ reliability }: { reliability: { marker: string } }) => (
    <div data-testid="reliability-body" data-marker={reliability.marker} />
  ),
}));

const { SetupPanel } = await import("@/components/profile/panels/SetupPanel");

const PROFILE = { handle: "dana", display_name: "Dana", user_id: 42, bio: "" } as never;
const RELIABILITY = { marker: "real-payload" } as never;

afterEach(cleanup);

describe("the panel holds no navigation of its own", () => {
  it.each(["standing", "reliability"] as const)("%s renders NO tablist and no tabs", (section) => {
    render(<SetupPanel profile={PROFILE} reliability={RELIABILITY} section={section} />);
    expect(screen.queryAllByRole("tablist"), "the retired strip came back").toHaveLength(0);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("tablist", { name: "Standing sections" })).toBeNull();
  });

  it("no leftover ids from the removed strip remain in the DOM", () => {
    const { container } = render(
      <SetupPanel profile={PROFILE} reliability={RELIABILITY} section="standing" />,
    );
    expect(container.querySelector("#setup-tab-standing")).toBeNull();
    expect(container.querySelector("#setup-panel-standing")).toBeNull();
    expect(container.querySelector("[aria-labelledby]")).toBeNull();
  });
});

describe("it renders exactly one section, chosen by the prop", () => {
  it("standing renders only the standing body", () => {
    render(<SetupPanel profile={PROFILE} reliability={RELIABILITY} section="standing" />);
    expect(screen.getAllByTestId("standing-body")).toHaveLength(1);
    expect(screen.queryByTestId("reliability-body"), "the sibling rendered too").toBeNull();
  });

  it("reliability renders only the reliability body", () => {
    render(<SetupPanel profile={PROFILE} reliability={RELIABILITY} section="reliability" />);
    expect(screen.getAllByTestId("reliability-body")).toHaveLength(1);
    expect(screen.queryByTestId("standing-body")).toBeNull();
  });

  it("the real data prop reaches the body unchanged", () => {
    render(<SetupPanel profile={PROFILE} reliability={RELIABILITY} section="reliability" />);
    expect(screen.getByTestId("reliability-body")).toHaveAttribute("data-marker", "real-payload");
    cleanup();
    render(<SetupPanel profile={PROFILE} reliability={RELIABILITY} section="standing" />);
    expect(screen.getByTestId("standing-body")).toHaveAttribute("data-handle", "dana");
  });

  it("switching section leaves no stale content from the sibling", () => {
    const { rerender } = render(
      <SetupPanel profile={PROFILE} reliability={RELIABILITY} section="standing" />,
    );
    expect(screen.getByTestId("standing-body")).toBeInTheDocument();

    rerender(<SetupPanel profile={PROFILE} reliability={RELIABILITY} section="reliability" />);

    expect(screen.queryByTestId("standing-body"), "the previous section lingered").toBeNull();
    expect(screen.getByTestId("reliability-body")).toBeInTheDocument();
  });

  it("a changed profile identity is reflected, not cached", () => {
    const { rerender } = render(
      <SetupPanel profile={PROFILE} reliability={RELIABILITY} section="standing" />,
    );
    expect(screen.getByTestId("standing-body")).toHaveAttribute("data-handle", "dana");

    rerender(
      <SetupPanel
        profile={{ ...(PROFILE as object), handle: "other" } as never}
        reliability={RELIABILITY}
        section="standing"
      />,
    );
    expect(screen.getByTestId("standing-body")).toHaveAttribute("data-handle", "other");
  });
});

describe("the reliability fallback survived the flattening", () => {
  it("an absent payload renders the soft unavailable state, not a crash or a blank", () => {
    render(<SetupPanel profile={PROFILE} reliability={undefined} section="reliability" />);
    expect(screen.queryByTestId("reliability-body")).toBeNull();
    expect(screen.getByText("UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open your mirror/i })).toHaveAttribute(
      "href",
      "/me/reliability",
    );
  });

  it("an absent payload does NOT affect the standing section", () => {
    render(<SetupPanel profile={PROFILE} reliability={undefined} section="standing" />);
    expect(screen.getByTestId("standing-body")).toBeInTheDocument();
    expect(screen.queryByText("UNAVAILABLE")).toBeNull();
  });
});

describe("mutation control", () => {
  it("S1: the tablist assertions are not vacuous — this harness CAN see a tablist", () => {
    // Every assertion above is an absence. Prove the query would find one.
    render(
      <div>
        <div role="tablist" aria-label="Standing sections">
          <button type="button" role="tab" aria-selected="true">STANDING</button>
        </div>
      </div>,
    );
    expect(screen.queryAllByRole("tablist")).toHaveLength(1);
    expect(screen.getByRole("tablist", { name: "Standing sections" })).toBeInTheDocument();
  });
});
