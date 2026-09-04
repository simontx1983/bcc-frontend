/**
 * LandingReveal — readable content must be the BASELINE, not the reward
 * for a successful hydration.
 *
 * `.bcc-ldg-reveal` is the scroll-reveal wrapper used by the onboarding
 * wizard's eyebrow, heading, lede and preview cards (and by the marketing
 * landing). It used to hide unconditionally: `opacity: 0`, restored only
 * when the client added `.is-visible`. Serving the real wizard and reading
 * the SSR HTML showed five reveal elements and zero `is-visible` — so the
 * server shipped every readable line invisible, and it stayed invisible if
 * JS failed, hydration failed, or IntersectionObserver was unavailable.
 *
 * The inversion under test: the element is hidden ONLY while it carries
 * `data-bcc-reveal="armed"`, which the client sets solely when it has
 * actually taken responsibility for revealing.
 */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let reduced = false;
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => reduced,
}));

const { LandingReveal } = await import("@/components/landing/LandingReveal");

type ObserverBucket = { instances: number };
const bucket: ObserverBucket = { instances: 0 };

function installObserver() {
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    class {
      constructor() {
        bucket.instances += 1;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
}

function removeObserver() {
  delete (window as unknown as Record<string, unknown>)["IntersectionObserver"];
}

const el = () => screen.getByText("Readable line");

beforeEach(() => {
  reduced = false;
  bucket.instances = 0;
  installObserver();
});

afterEach(() => {
  cleanup();
  installObserver();
});

describe("armed state", () => {
  it("arms only when an observer is genuinely watching", async () => {
    render(<LandingReveal>Readable line</LandingReveal>);
    await waitFor(() => {
      expect(el().getAttribute("data-bcc-reveal")).toBe("armed");
    });
    expect(bucket.instances).toBe(1);
  });

  it("drops the armed attribute once revealed", async () => {
    // Reveal is driven by the observer callback; reduced motion is the
    // deterministic path to the revealed state.
    reduced = true;
    render(<LandingReveal>Readable line</LandingReveal>);
    await waitFor(() => {
      expect(el().className).toContain("is-visible");
    });
    expect(el().getAttribute("data-bcc-reveal")).toBeNull();
  });
});

describe("degradation — the content stays readable", () => {
  it("never arms when IntersectionObserver is unavailable", async () => {
    removeObserver();
    render(<LandingReveal>Readable line</LandingReveal>);
    await waitFor(() => {
      expect(el().className).toContain("is-visible");
    });
    // Unarmed ⇒ the hide rule does not apply ⇒ the text is visible.
    expect(el().getAttribute("data-bcc-reveal")).toBeNull();
    installObserver();
  });

  it("never arms under reduced motion", async () => {
    reduced = true;
    render(<LandingReveal>Readable line</LandingReveal>);
    await waitFor(() => {
      expect(el().className).toContain("is-visible");
    });
    expect(el().getAttribute("data-bcc-reveal")).toBeNull();
  });

  it("carries the reveal class in every case, so the animation still applies", () => {
    render(<LandingReveal>Readable line</LandingReveal>);
    expect(el().className).toContain("bcc-ldg-reveal");
  });
});

describe("the CSS matches the component's contract", () => {
  const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");

  const HIDE = /\.bcc-ldg-reveal\[data-bcc-reveal="armed"\]\s*\{[^}]*opacity:\s*0/;

  it("hides ONLY the armed state", () => {
    expect(CSS).toMatch(HIDE);
  });

  it("does not hide the bare class — that was the defect", () => {
    // The pre-fix rule was `.bcc-ldg-reveal { opacity: 0; ... }`. Any
    // unqualified opacity:0 on this class re-breaks the no-JS baseline.
    expect(CSS).not.toMatch(/\.bcc-ldg-reveal\s*\{[^}]*opacity:\s*0/);
  });

  it("MUTATION CONTROL — both assertions fail on the pre-fix rule", () => {
    const preFix = CSS.replace(
      HIDE,
      ".bcc-ldg-reveal { opacity: 0; transform: translateY(22px)",
    );
    expect(preFix).not.toMatch(HIDE);
    expect(preFix).toMatch(/\.bcc-ldg-reveal\s*\{[^}]*opacity:\s*0/);
  });
});
