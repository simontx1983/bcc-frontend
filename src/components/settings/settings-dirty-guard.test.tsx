/**
 * Settings dirty guard — sub-tab navigation must not silently destroy edits.
 *
 * Two properties carry the whole feature and are asserted directly rather
 * than inferred:
 *
 *   • While the dialog is open the URL has NOT changed and the panel is STILL
 *     MOUNTED. If either were false the edits would already be gone and the
 *     dialog would be theatre.
 *
 *   • Discard navigates EXACTLY ONCE. The bypass is a mutable ref, so an
 *     off-by-one there would double-fire or leak into a later navigation.
 *
 * The guard is driven through a harness rather than the real ProfileTabs so
 * the tests exercise the state machine without dragging eight settings panels
 * and their network hooks in behind it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import {
  SettingsDirtyProvider,
  useSettingsDirtyGuard,
} from "@/components/settings/SettingsDirtyProvider";
import { SubTabNav } from "@/components/profile/SubTabNav";
import { useDirtyRegistration } from "@/hooks/useDirtyRegistration";

/**
 * jsdom implements no layout engine, so `Element.prototype.scrollIntoView`
 * does not exist — and `useRovingTabs` calls it whenever keyboard focus moves
 * between tabs.
 *
 * This file previously relied on a sibling test file patching the prototype
 * globally. That worked locally only because the two shared a vitest worker;
 * CI scheduled them apart and the dependency surfaced as an unhandled
 * TypeError. So the stub is installed here, and — unlike the patch it
 * replaces — it is undone afterwards: the original descriptor is captured and
 * restored, or the temporary property is deleted when there was none to begin
 * with. Leaving a permanent prototype mutation behind is what caused the
 * problem in the first place.
 */
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {},
    writable: true,
    configurable: true,
  });
});

afterAll(() => {
  if (originalScrollIntoView === undefined) {
    // jsdom never defined it — leave the prototype exactly as we found it.
    // Bracket access: the cast is an index signature, and this project has
    // noPropertyAccessFromIndexSignature on.
    delete (Element.prototype as unknown as Record<string, unknown>)[
      "scrollIntoView"
    ];
  } else {
    Object.defineProperty(
      Element.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  }
});

afterEach(cleanup);

/**
 * A form that owns a draft and a mutation lifecycle, so tests can drive
 * save -> settle transitions rather than pinning `isSaving` to a constant.
 * A static flag would leave the provider’s settle effect — the most
 * intricate part of the guard — completely unexercised.
 */
function DemoForm({
  id = "demo",
  label = "your demo field",
}: {
  id?: string;
  label?: string;
}) {
  const [value, setValue] = useState("clean");
  const [baseline, setBaseline] = useState("clean");
  const [saving, setSaving] = useState(false);

  useDirtyRegistration({
    id,
    label,
    isDirty: value !== baseline,
    isSaving: saving,
  });

  return (
    <span>
      <input
        aria-label={`field-${id}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" onClick={() => setSaving(true)}>
        {`save-${id}`}
      </button>
      {/* Settle succeeded: the caller adopts the new confirmed baseline,
          which is what makes the form report clean. */}
      <button
        type="button"
        onClick={() => {
          setBaseline(value);
          setSaving(false);
        }}
      >
        {`succeed-${id}`}
      </button>
      {/* Settle failed: baseline untouched, so the form stays dirty. */}
      <button type="button" onClick={() => setSaving(false)}>
        {`fail-${id}`}
      </button>
    </span>
  );
}

/** Stands in for ProfileTabs: two tabs, one mounted panel, one guard. */
function Harness({
  navigate,
  twoForms = false,
}: {
  navigate: (key: string) => void;
  twoForms?: boolean;
}) {
  const [active, setActive] = useState("one");
  const guard = useSettingsDirtyGuard<string>((key) => {
    navigate(key);
    setActive(key); // the real unmount
  });

  return (
    <SettingsDirtyProvider registry={guard.registry}>
      <button type="button" onClick={() => guard.requestNavigation("one")}>
        tab-one
      </button>
      <button type="button" onClick={() => guard.requestNavigation("two")}>
        tab-two
      </button>
      <div data-testid="panel">
        {active === "one" ? (
          <>
            <DemoForm />
            {twoForms && <DemoForm id="second" label="your second field" />}
          </>
        ) : (
          <p>panel two</p>
        )}
      </div>
      {guard.dialog}
    </SettingsDirtyProvider>
  );
}

/** Uses the real SubTabNav so keyboard activation is proven, not simulated. */
function KeyboardHarness({ navigate }: { navigate: (key: string) => void }) {
  const [active, setActive] = useState<"one" | "two">("one");
  const guard = useSettingsDirtyGuard<"one" | "two">((key) => {
    navigate(key);
    setActive(key);
  });
  return (
    <SettingsDirtyProvider registry={guard.registry}>
      <SubTabNav
        tabs={[
          { key: "one", label: "One" },
          { key: "two", label: "Two" },
        ]}
        active={active}
        onSelect={guard.requestNavigation}
        ariaLabel="Harness sections"
        idBase="kb"
      />
      {active === "one" ? <DemoForm /> : <p>panel two</p>}
      {guard.dialog}
    </SettingsDirtyProvider>
  );
}

const click = (label: string) => fireEvent.click(screen.getByText(label));
const dirtyTheForm = (id = "demo") =>
  fireEvent.change(screen.getByLabelText(`field-${id}`), {
    target: { value: "edited" },
  });

describe("clean navigation is untouched", () => {
  it("navigates immediately with no dialog", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);

    fireEvent.click(screen.getByText("tab-two"));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("two");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("panel two")).toBeInTheDocument();
  });
});

describe("dirty navigation is intercepted", () => {
  it("opens the dialog instead of navigating", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();

    fireEvent.click(screen.getByText("tab-two"));

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("leaves the panel MOUNTED with its value intact while the dialog is open", () => {
    // The whole point: if the panel had unmounted the edit would already be
    // lost and the dialog would be asking about nothing.
    render(<Harness navigate={vi.fn()} />);
    dirtyTheForm();
    fireEvent.click(screen.getByText("tab-two"));

    expect(screen.getByLabelText("field-demo")).toHaveValue("edited");
    expect(screen.queryByText("panel two")).toBeNull();
  });

  it("names what is unsaved", () => {
    render(<Harness navigate={vi.fn()} />);
    dirtyTheForm();
    fireEvent.click(screen.getByText("tab-two"));

    expect(screen.getByRole("dialog").textContent).toContain("your demo field");
  });

  it("Keep editing stays put and does not navigate", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    fireEvent.click(screen.getByText("tab-two"));

    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("field-demo")).toHaveValue("edited");
  });

  it("Escape behaves as Keep editing", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    fireEvent.click(screen.getByText("tab-two"));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("field-demo")).toHaveValue("edited");
  });

  it("Discard navigates EXACTLY once", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    fireEvent.click(screen.getByText("tab-two"));

    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("two");
    expect(screen.getByText("panel two")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the discard bypass cannot be reused by a later navigation", () => {
    // A leaked bypass would let the NEXT dirty navigation skip the dialog.
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    fireEvent.click(screen.getByText("tab-two"));
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));

    // Back to panel one, dirty it again, and try to leave.
    fireEvent.click(screen.getByText("tab-one"));
    dirtyTheForm();
    navigate.mockClear();
    fireEvent.click(screen.getByText("tab-two"));

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("rapid repeated clicks produce one dialog and one navigation", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();

    fireEvent.click(screen.getByText("tab-two"));
    fireEvent.click(screen.getByText("tab-two"));
    fireEvent.click(screen.getByText("tab-two"));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe("saving beats dirty", () => {
  it("offers no Discard while a save is in flight", () => {
    // Discard cannot promise the server will ignore a request already sent.
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    click("save-demo");

    click("tab-two");

    expect(
      screen.getByRole("dialog", { name: /saving your changes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/please wait before leaving/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discard changes/i })).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps the panel mounted and the URL untouched while waiting", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    click("save-demo");
    click("tab-two");

    expect(screen.getByLabelText("field-demo")).toHaveValue("edited");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("queued success with everything clean navigates exactly once", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    click("save-demo");
    click("tab-two");

    click("succeed-demo");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("two");
    expect(screen.getByText("panel two")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("queued FAILURE keeps the work and switches to the decision dialog", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    click("save-demo");
    click("tab-two");

    click("fail-demo");

    expect(navigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /unsaved changes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /discard changes/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("field-demo")).toHaveValue("edited");
  });

  it("a failure then a successful retry navigates once", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    click("save-demo");
    click("tab-two");
    click("fail-demo");

    // Decision dialog is up. Keep editing, retry, and let it succeed.
    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    click("save-demo");
    click("succeed-demo");

    // The queue was cancelled by Keep editing, so nothing auto-navigates.
    expect(navigate).not.toHaveBeenCalled();
    // And now the form is clean, so leaving is immediate.
    click("tab-two");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("Stay here cancels the queue, so a later success does not navigate", () => {
    // A late mutation result must not yank the user out of the panel they
    // deliberately chose to stay in.
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    click("save-demo");
    click("tab-two");

    fireEvent.click(screen.getByRole("button", { name: /stay here/i }));
    click("succeed-demo");

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("field-demo")).toBeInTheDocument();
  });

  it("only one destination can be queued while saving", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    click("save-demo");

    click("tab-two");
    click("tab-one"); // must NOT replace the queued destination
    click("tab-two");

    click("succeed-demo");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("two");
  });
});

describe("one form saving while another stays dirty", () => {
  it("does NOT navigate away and discard the other form", () => {
    // The dangerous case: form A settles clean, but form B still holds
    // unsaved work. Navigating here would destroy B silently.
    const navigate = vi.fn();
    render(<Harness navigate={navigate} twoForms />);
    dirtyTheForm("demo");
    dirtyTheForm("second");
    click("save-demo");

    click("tab-two");
    expect(
      screen.getByRole("dialog", { name: /saving your changes/i }),
    ).toBeInTheDocument();

    click("succeed-demo"); // A is clean; B is still dirty

    expect(navigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /unsaved changes/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog").textContent).toContain("your second field");
    expect(screen.getByLabelText("field-second")).toHaveValue("edited");
  });

  it("navigates once both forms are clean", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} twoForms />);
    dirtyTheForm("demo");
    dirtyTheForm("second");
    click("save-demo");
    click("tab-two");
    click("succeed-demo");

    // Decision dialog for the remaining form; clear it and go.
    click("succeed-second");
    fireEvent.click(screen.getByRole("button", { name: /keep editing/i }));
    click("tab-two");

    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
describe("multiple forms", () => {
  it("tracks two dirty forms and names both", () => {
    render(<Harness navigate={vi.fn()} twoForms />);
    dirtyTheForm("demo");
    dirtyTheForm("second");

    fireEvent.click(screen.getByText("tab-two"));

    const text = screen.getByRole("dialog").textContent ?? "";
    expect(text).toContain("your demo field");
    expect(text).toContain("your second field");
  });

  it("one clean form does not hold up navigation", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} twoForms />);

    fireEvent.click(screen.getByText("tab-two"));

    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe("registration lifecycle", () => {
  it("does not mark dirty on initial render", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);

    fireEvent.click(screen.getByText("tab-two"));

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("unmount removes the registration, so the next move is clean", () => {
    const navigate = vi.fn();
    render(<Harness navigate={navigate} />);
    dirtyTheForm();
    fireEvent.click(screen.getByText("tab-two"));
    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));

    // Panel one (and its form) is gone; leaving panel two must not prompt.
    navigate.mockClear();
    fireEvent.click(screen.getByText("tab-one"));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a form outside the provider is inert rather than throwing", () => {
    expect(() => render(<DemoForm />)).not.toThrow();
  });
});

describe("scope boundaries, asserted at the source", () => {
  const read = (p: string) =>
    readFileSync(resolve(process.cwd(), p), "utf-8");

  it("genuine autosave controls never register", () => {
    // PrivacySettingsForm and MentorSettingsSection mutate on change, so they
    // have no pending state to lose. Registering them would produce a warning
    // for work that was already saved.
    for (const f of [
      "src/components/settings/PrivacySettingsForm.tsx",
      "src/components/settings/profile/MentorSettingsSection.tsx",
    ]) {
      expect(read(f), `${f} must not register dirty state`).not.toContain(
        "useDirtyRegistration",
      );
    }
  });

  it("the delete-account flow never registers", () => {
    // Abandoning a destructive flow must stay frictionless, and a warning
    // there would nudge toward completing it.
    const src = read("src/components/settings/profile/AccountSection.tsx");
    const deleteCard = src.slice(src.indexOf("function DeleteAccountCard"));
    expect(deleteCard).not.toContain("useDirtyRegistration");
    // The two cards above it DO register.
    expect(src).toContain('id: "account.email"');
    expect(src).toContain('id: "account.password"');
  });

  it("a registration carries booleans and a label — never a value", () => {
    // The registry must not become somewhere a password can be read out of
    // React state. The type is the guarantee; this pins it.
    const src = read("src/components/settings/SettingsDirtyProvider.tsx");
    const entry = src.slice(
      src.indexOf("export interface DirtyEntry"),
      src.indexOf("}", src.indexOf("export interface DirtyEntry")),
    );
    expect(entry).toContain("label: string");
    expect(entry).toContain("isDirty: boolean");
    expect(entry).toContain("isSaving: boolean");
    for (const leak of ["value", "password", "email", "draft"]) {
      expect(entry.toLowerCase(), `DirtyEntry must not carry ${leak}`).not.toContain(
        leak,
      );
    }
  });

  it("has no clearAll — the provider owns no drafts and cannot reset a form", () => {
    // Strip comments first: the file's own docblock explains WHY there is no
    // clearAll, and that sentence is worth keeping.
    const src = read("src/components/settings/SettingsDirtyProvider.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(src).not.toMatch(/\bclearAll\b/);
  });
});

describe("keyboard activation goes through the guard", () => {
  const tabs = () =>
    within(screen.getByRole("tablist", { name: "Harness sections" })).getAllByRole(
      "tab",
    );

  it("Enter on a dirty form opens the dialog instead of navigating", () => {
    const navigate = vi.fn();
    render(<KeyboardHarness navigate={navigate} />);
    dirtyTheForm();

    fireEvent.keyDown(tabs()[1]!, { key: "Enter" });

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Space on a dirty form opens the dialog instead of navigating", () => {
    const navigate = vi.fn();
    render(<KeyboardHarness navigate={navigate} />);
    dirtyTheForm();

    fireEvent.keyDown(tabs()[1]!, { key: " " });

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("arrow keys move focus only — no dialog, no panel change", () => {
    // Manual activation: arrowing past a tab must not mount a panel, warn,
    // or touch the query.
    const navigate = vi.fn();
    render(<KeyboardHarness navigate={navigate} />);
    dirtyTheForm();

    fireEvent.keyDown(tabs()[0]!, { key: "ArrowRight" });
    fireEvent.keyDown(tabs()[1]!, { key: "Home" });
    fireEvent.keyDown(tabs()[0]!, { key: "End" });

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("field-demo")).toBeInTheDocument();
  });

  it("Enter on a clean form navigates immediately", () => {
    const navigate = vi.fn();
    render(<KeyboardHarness navigate={navigate} />);

    fireEvent.keyDown(tabs()[1]!, { key: "Enter" });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("confirmed baselines, asserted at the source", () => {
  const hero = () =>
    readFileSync(
      resolve(process.cwd(), "src/components/settings/profile/ProfileHero.tsx"),
      "utf-8",
    );

  it("display name compares against the server-confirmed name, not the prop", () => {
    // `profile` is a server-component prop refreshed asynchronously by
    // router.refresh(), and onSuccess does not reset nameDraft. Comparing
    // against the prop meant re-opening the editor after a save reported
    // dirty with nothing changed.
    //
    // The profile-tab slice replaced the separate `savedName` / `savedPos`
    // baselines with one field-owned `confirmed` record. The invariant is
    // unchanged and still asserted here — only the name of the baseline
    // moved. The negative assertion is the load-bearing half.
    const src = hero();
    expect(src).toContain("nameDraft.trim() !== confirmed.display_name.trim()");
    expect(src).not.toContain("nameDraft.trim() !== profile.display_name.trim()");
    expect(src).toContain('confirmField("display_name", data.display_name)');
  });

  it("cover position compares against the confirmed saved coordinates", () => {
    const src = hero();
    expect(src).toContain("posX !== confirmed.cover_photo_position.x");
    expect(src).toContain("posY !== confirmed.cover_photo_position.y");
    expect(src).not.toContain("posX !== profile.cover_photo_position.x");
    expect(src).toContain('confirmField("cover_photo_position"');
  });

  it("no mutation writes the whole confirmed record from its response", () => {
    // Every /me/profile mutation returns a FULL MemberProfile, each a
    // snapshot taken when that request ran. The display-name mutation is
    // not gated by `busy` and can overlap a media upload, so writing the
    // whole object would let either response's stale copy of the other
    // field win purely on arrival order.
    const src = hero();
    expect(src).not.toMatch(/setConfirmed\(data\)/);
    // The only unconditional whole-record writes are the initial seed and
    // the identity-change reset.
    expect([...src.matchAll(/setConfirmed\(/g)]).toHaveLength(2);
  });

  it("the email card compares against the confirmed email, not the prop", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/settings/profile/AccountSection.tsx"),
      "utf-8",
    );
    expect(src).toContain("email.trim() !== confirmedEmail.trim()");
    expect(src).toContain("setConfirmedEmail(email)");
  });
});
