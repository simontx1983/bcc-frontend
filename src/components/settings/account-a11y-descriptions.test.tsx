/**
 * Accessible names and descriptions, asked for the way assistive tech
 * asks — and the `LoadFailure` change proven additive.
 *
 * ## Why not grep for aria-describedby
 *
 * Because an `aria-describedby` pointing at an id that does not exist, or
 * at an element rendered somewhere else, still greps clean. These
 * assertions go through the accessibility tree instead:
 * `toHaveAccessibleDescription` resolves the reference the way a screen
 * reader does, so a dangling id fails.
 *
 * ## Why the ids are generated
 *
 * `useId`, not literals. Two instances of a form with hardcoded ids would
 * point both descriptions at the first one — silently, and only for
 * screen-reader users. The duplicate-mount cases below prove it.
 *
 * ## LoadFailure
 *
 * This slice added a `retryLabel` prop. Twenty-six call sites already use
 * this component and none of them pass it, so the change is only safe if
 * the default is exactly what they rendered before. That is asserted
 * behaviourally here, and the count is re-derived from the tree rather
 * than pinned to a number that would rot.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { sourceFiles } from "@/app/source-tree.testing";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

import { LoadFailure } from "@/components/ui/LoadFailure";
import { AccountSection } from "@/components/settings/profile/AccountSection";
import { DeleteAccountCard } from "@/components/settings/profile/DeleteAccountCard";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {}, writable: true, configurable: true,
  });
});
afterEach(cleanup);

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// ─────────────────────────────────────────────────────────────────────
// Sign-in forms
// ─────────────────────────────────────────────────────────────────────

describe("the email and password forms describe themselves", () => {
  it("every field has a resolvable accessible description", () => {
    withClient(<AccountSection currentEmail="dana@example.com" />);
    // Any field carrying aria-describedby must resolve to real text; an id
    // that points nowhere yields an empty string here.
    const described = [...document.querySelectorAll("[aria-describedby]")];
    expect(described.length, "no described fields at all").toBeGreaterThan(0);
    for (const el of described) {
      const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      for (const id of ids) {
        const target = document.getElementById(id);
        expect(target, `aria-describedby="${id}" points at nothing`).not.toBeNull();
        expect((target?.textContent ?? "").trim(), `#${id} is empty`).not.toBe("");
      }
    }
  });

  it("the delete form's fields are described by the permanence warning", () => {
    withClient(<DeleteAccountCard />);
    fireEvent.click(screen.getByRole("button", { name: /Delete my account/ }));

    const phrase = screen.getByLabelText(/TYPE DELETE TO CONFIRM/i);
    const password = screen.getByLabelText(/CURRENT PASSWORD/i);
    for (const field of [phrase, password]) {
      expect(field).toHaveAccessibleDescription(/permanent/i);
      expect(field).toHaveAccessibleDescription(/current password/i);
    }
  });

  it("TWO mounted copies do not share one description id", () => {
    // The failure a literal id produces: both forms' descriptions resolve
    // to the first instance, so the second form silently describes the
    // wrong thing. Only visible to a screen-reader user.
    withClient(
      <>
        <DeleteAccountCard />
        <DeleteAccountCard />
      </>,
    );
    for (const t of screen.getAllByRole("button", { name: /Delete my account/ })) {
      fireEvent.click(t);
    }

    const ids = [...document.querySelectorAll("[id]")].map((n) => n.id);
    expect(new Set(ids).size, `duplicate id among ${ids.join(", ")}`).toBe(ids.length);

    const described = [...document.querySelectorAll("[aria-describedby]")].map((n) =>
      n.getAttribute("aria-describedby"),
    );
    // Two independent forms ⇒ at least two distinct description targets.
    expect(new Set(described).size).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// LoadFailure
// ─────────────────────────────────────────────────────────────────────

/**
 * Every file under src/ that renders <LoadFailure, as the repo-root path
 * ("src/…") the slice list below uses. Taken at collection, outside every
 * test's timer (F-449).
 */
const LOAD_FAILURE_SITES = sourceFiles()
  .filter((f) => f.code.includes("<LoadFailure"))
  .map((f) => ({ path: `src/${f.rel}`, code: f.code }));

describe("LoadFailure stayed backward compatible", () => {
  it("a caller that passes no retryLabel still renders Retry", () => {
    render(<LoadFailure message="Couldn't load." onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: /Retry/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("omitting onRetry still renders NO button, label or not", () => {
    render(<LoadFailure message="Gone." retryLabel="Try again" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("the message is still the alert", () => {
    render(<LoadFailure message="Couldn't load." onRetry={() => {}} />);
    expect(screen.getByRole("alert").textContent).toBe("Couldn't load.");
  });

  it("the new label replaces only the button text", () => {
    render(
      <LoadFailure message="Couldn't load." onRetry={() => {}} retryLabel="Try again" />,
    );
    expect(screen.getByRole("button", { name: /Try again/ })).toBeDefined();
    expect(screen.getByRole("alert").textContent).toBe("Couldn't load.");
  });

  it("surface=paper is unaffected by the addition", () => {
    render(<LoadFailure message="Couldn't load." onRetry={() => {}} surface="paper" />);
    expect(screen.getByRole("button", { name: /Retry/ }).className).toContain("text-ink");
  });

  it("EVERY LoadFailure call site outside this slice still omits retryLabel", () => {
    // Derived, not pinned. `retryLabel` is also a ConfirmDialog prop, so
    // the check is scoped to files that actually render <LoadFailure and
    // pass it — a bare grep for the identifier conflates the two.
    //
    // F-449: this read the tree with a `git grep` subprocess inside the
    // test, which under load outlasted the 5s test timeout. It now uses
    // the shared walk taken at collection (LOAD_FAILURE_SITES, above this
    // describe). That walk also sees untracked files, which `git grep`
    // did not: a stray uncommitted call site now counts, as it should.
    const consumers = LOAD_FAILURE_SITES.map((f) => f.path);
    expect(consumers.length, "no LoadFailure consumers found — the scan is broken").toBeGreaterThan(20);

    const optedIn = LOAD_FAILURE_SITES.filter((f) =>
      // Only look inside LoadFailure elements.
      [...f.code.matchAll(/<LoadFailure[\s\S]*?\/>/g)].some((m) => m[0].includes("retryLabel")),
    ).map((f) => f.path);

    const thisSlice = [
      "src/components/settings/AccountActivitySection.tsx",
      "src/components/settings/WalletsSection.tsx",
    ];
    const unexpected = optedIn.filter((f) => !thisSlice.includes(f) && !f.includes(".test."));
    expect(unexpected, `unexpected LoadFailure retryLabel: ${unexpected.join(", ")}`).toHaveLength(0);
    // And the two that DO opt in really do — otherwise this passes vacuously.
    expect(optedIn.filter((f) => thisSlice.includes(f)).sort()).toEqual(thisSlice.sort());
  });
});
