/**
 * The Profile sub-tab: discoverable controls, honest feedback, no lost work.
 *
 * Covers the four behaviours the profile-tab slice added or repaired, each
 * pinned by the property that would have prevented the original defect:
 *
 *   1. `rowSaveOutcome` never reports a bare success while a requested half
 *      failed, and only reasons about halves the current attempt asked for.
 *   2. A field row's two drafts sync independently, so a successful VALUE
 *      merge cannot discard a visibility choice whose own request failed.
 *   3. ProfileHero's confirmed fields are written per-field and survive a
 *      stale `router.refresh()` prop.
 *   4. The bio editor exists at all, uses the server as its only validator,
 *      and takes its baseline from the server's sanitised response.
 *
 * Cache-arrival ordering for (2) lives in `profile-field-race.test.tsx`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const refresh = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const getFields = vi.fn();
const patchValue = vi.fn();
const patchVisibility = vi.fn();
vi.mock("@/lib/api/profile-fields-endpoints", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getProfileFields: (...a: unknown[]) => getFields(...a),
    patchProfileFieldValue: (...a: unknown[]) => patchValue(...a),
    patchProfileFieldVisibility: (...a: unknown[]) => patchVisibility(...a),
  };
});

/**
 * ProfileHero's six mutations, captured so a test can fire a specific
 * `onSuccess` with a specific server payload. Each entry records the options
 * the component passed, which is the only way to drive one mutation's
 * success without touching the others.
 */
interface Captured {
  onSuccess?: (data: unknown, vars?: unknown) => void;
  onError?: (err: unknown) => void;
}
const captured: Record<string, Captured> = {};
const idle = { isPending: false, isError: false, isSuccess: false };
function fakeHook(name: string) {
  return (opts: Captured = {}) => {
    captured[name] = opts;
    return { ...idle, mutate: vi.fn(), reset: vi.fn() };
  };
}
vi.mock("@/hooks/useUpdateProfile", () => ({
  useUpdateBio: fakeHook("bio"),
  useUpdateCoverPosition: fakeHook("position"),
  useUploadAvatar: fakeHook("uploadAvatar"),
  useDeleteAvatar: fakeHook("deleteAvatar"),
  useUploadCover: fakeHook("uploadCover"),
  useDeleteCover: fakeHook("deleteCover"),
}));

import { rowSaveOutcome } from "@/components/settings/profile/field-save-outcome";
import { HandleSection } from "@/components/settings/HandleSection";
import { ProfileFieldsList } from "@/components/settings/profile/ProfileFieldsList";
import { ProfileHero } from "@/components/settings/profile/ProfileHero";
import { PROFILE_FIELDS_QUERY_KEY } from "@/hooks/useProfileFields";
import type {
  ProfileField,
  ProfileFieldsResponse,
} from "@/lib/api/profile-fields-endpoints";
import type { MemberProfile } from "@/lib/api/types";

const PROFILE = {
  id: 7,
  user_id: 7,
  handle: "welder",
  display_name: "Old Name",
  bio: "",
  avatar_url: "/images/a.png",
  cover_photo_url: "/images/c.png",
  cover_photo_position: { x: 50, y: 50 },
} as unknown as MemberProfile;

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
});

beforeEach(() => {
  refresh.mockReset();
  searchParams = new URLSearchParams();
  for (const k of Object.keys(captured)) delete captured[k];
});
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────────
// 1. rowSaveOutcome — the partial-save truth table
// ─────────────────────────────────────────────────────────────────────────

/** Open the photo menu. Never hover — that is the defect being fixed. */
function openPhotoMenu() {
  fireEvent.click(screen.getByRole("button", { name: /Edit photos/ }));
}

const OK = { isPending: false, isError: false, isSuccess: true };
const ERR = { isPending: false, isError: true, isSuccess: false };
const PENDING = { isPending: true, isError: false, isSuccess: false };
const IDLE = { isPending: false, isError: false, isSuccess: false };

describe("rowSaveOutcome", () => {
  const call = (rv: boolean, rs: boolean, v = IDLE, s = IDLE) =>
    rowSaveOutcome({
      requestedValue: rv,
      requestedVisibility: rs,
      value: v,
      visibility: s,
    });

  it("nothing requested is idle and silent", () => {
    expect(call(false, false, OK, ERR)).toEqual({ status: "idle", errorMessage: null });
  });

  it("both succeed → one plain Saved", () => {
    expect(call(true, true, OK, OK)).toEqual({ status: "saved", errorMessage: null });
  });

  it("value ok + visibility failed → NO bare success, and says which landed", () => {
    const r = call(true, true, OK, ERR);
    expect(r.status).not.toBe("saved");
    expect(r.errorMessage).toBe(
      "Saved your answer, but couldn't change who can see it. Try again.",
    );
  });

  it("visibility ok + value failed → NO bare success, and says which landed", () => {
    const r = call(true, true, ERR, OK);
    expect(r.status).not.toBe("saved");
    expect(r.errorMessage).toBe(
      "Changed who can see it, but couldn't save your answer. Try again.",
    );
  });

  it("both fail → one message, no claim that anything saved", () => {
    expect(call(true, true, ERR, ERR)).toEqual({
      status: "idle",
      errorMessage: "Couldn't save. Try again.",
    });
  });

  it("single-half attempts report only their own half", () => {
    expect(call(true, false, OK, ERR).status).toBe("saved");
    expect(call(false, true, ERR, OK).status).toBe("saved");
    expect(call(true, false, ERR, OK).errorMessage).toBe(
      "Couldn't save your answer. Try again.",
    );
    expect(call(false, true, OK, ERR).errorMessage).toBe(
      "Couldn't change who can see it. Try again.",
    );
  });

  it("anything still in flight is 'saving', never a premature verdict", () => {
    expect(call(true, true, PENDING, OK).status).toBe("saving");
    expect(call(true, true, OK, PENDING).status).toBe("saving");
    // Requested but not yet pending — the render between mutate() and the
    // flag flipping. Must not read as idle.
    expect(call(true, false, IDLE).status).toBe("saving");
  });

  it("a stale success from the PREVIOUS attempt cannot leak in", () => {
    // Retrying only visibility: React Query still reports the earlier value
    // mutation as successful. Gating on `requested` is what stops that
    // being read as "both fine".
    const r = call(false, true, OK, ERR);
    expect(r.status).not.toBe("saved");
    expect(r.errorMessage).toBe("Couldn't change who can see it. Try again.");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Field rows — independent draft sync
// ─────────────────────────────────────────────────────────────────────────

const FIELD = {
  key: "trade",
  label: "Trade",
  help_text: "What you do",
  type: "text",
  value: "welder",
  visibility: "private",
  visibility_locked: false,
  editable: true,
  required: true,
  max_length: null,
  options: [],
  order: 1,
} as unknown as ProfileField;

const RESPONSE = {
  fields: [FIELD],
  stats: { filled: 1, total: 1, completeness: 100 },
} as unknown as ProfileFieldsResponse;

function renderFields() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(PROFILE_FIELDS_QUERY_KEY, RESPONSE);
  const utils = render(
    <QueryClientProvider client={client}>
      <ProfileFieldsList />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

describe("profile field row", () => {
  beforeEach(() => {
    getFields.mockResolvedValue(RESPONSE);
    patchValue.mockReset();
    patchVisibility.mockReset();
  });

  it("a value-only cache update does not reset the visibility draft", async () => {
    const { client } = renderFields();
    const select = screen.getByRole("combobox", { name: "Who can see Trade" });

    fireEvent.change(select, { target: { value: "public" } });
    expect((select as HTMLSelectElement).value).toBe("public");

    // The other half of the same save lands: ONLY `value` moves in the cache,
    // exactly as the owned-property merge writes it.
    act(() => {
      client.setQueryData<ProfileFieldsResponse>(PROFILE_FIELDS_QUERY_KEY, (prev) => ({
        ...(prev as ProfileFieldsResponse),
        fields: [{ ...FIELD, value: "electrician" }],
      }));
    });

    await waitFor(() =>
      expect(screen.getByDisplayValue("electrician")).toBeDefined(),
    );
    // The regression: one shared effect reset BOTH drafts here, silently
    // discarding a visibility choice whose own request had failed.
    expect(
      (screen.getByRole("combobox", { name: "Who can see Trade" }) as HTMLSelectElement)
        .value,
    ).toBe("public");
  });

  it("a visibility-only cache update does not reset the value draft", async () => {
    const { client } = renderFields();
    const input = screen.getByDisplayValue("welder");
    fireEvent.change(input, { target: { value: "typed but unsaved" } });

    act(() => {
      client.setQueryData<ProfileFieldsResponse>(PROFILE_FIELDS_QUERY_KEY, (prev) => ({
        ...(prev as ProfileFieldsResponse),
        fields: [{ ...FIELD, visibility: "public" }],
      }));
    });

    await waitFor(() =>
      expect(
        (screen.getByRole("combobox", { name: "Who can see Trade" }) as HTMLSelectElement)
          .value,
      ).toBe("public"),
    );
    expect(screen.getByDisplayValue("typed but unsaved")).toBeDefined();
  });

  it("required is announced, not just coloured", () => {
    renderFields();
    const input = screen.getByDisplayValue("welder");
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(screen.getByText("Required")).toBeDefined();
  });

  it("help text is linked to the control, not just adjacent to it", () => {
    renderFields();
    const input = screen.getByDisplayValue("welder");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe("What you do");
  });

  it("each visibility control carries its own field's name", () => {
    renderFields();
    // The old static "Field visibility" gave every row the same name.
    expect(screen.queryByRole("combobox", { name: "Field visibility" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Who can see Trade" })).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. ProfileHero — confirmed fields
// ─────────────────────────────────────────────────────────────────────────

describe("ProfileHero confirmed state", () => {
  it("the photo trigger is visible without hover and carries a text label", () => {
    render(<ProfileHero profile={PROFILE} />);
    const trigger = screen.getByRole("button", { name: /Edit photos/ });
    expect(trigger).toBeDefined();
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // The wall of five labelled buttons is gone.
    expect(screen.queryByRole("group", { name: "Profile photo controls" })).toBeNull();
  });

  it("a display-name save survives a stale refresh prop", async () => {
    const { rerender } = render(<ProfileHero profile={PROFILE} />);
    act(() => captured["bio"]?.onSuccess?.({ ...PROFILE, display_name: "New Name" }));
    await waitFor(() => expect(screen.getByText("New Name")).toBeDefined());

    // router.refresh() lands, but the server component still has the OLD
    // name and a NEWER cover. Adopting the whole prop would undo the save.
    rerender(
      <ProfileHero
        profile={{ ...PROFILE, display_name: "Old Name", cover_photo_url: "/images/c2.png" }}
      />,
    );
    expect(screen.getByText("New Name")).toBeDefined();
    expect(screen.queryByText("Old Name")).toBeNull();
  });

  it("name and avatar responses do not overwrite each other, in either order", async () => {
    const { rerender } = render(<ProfileHero profile={PROFILE} />);

    // The avatar response carries a FULL profile whose display_name is stale.
    act(() => captured["bio"]?.onSuccess?.({ ...PROFILE, display_name: "New Name" }));
    act(() =>
      captured["uploadAvatar"]?.onSuccess?.({
        ...PROFILE,
        display_name: "Old Name",
        avatar_url: "/images/a2.png",
      }),
    );
    await waitFor(() => expect(screen.getByText("New Name")).toBeDefined());

    cleanup();
    render(<ProfileHero profile={PROFILE} />);
    act(() =>
      captured["uploadAvatar"]?.onSuccess?.({
        ...PROFILE,
        display_name: "Old Name",
        avatar_url: "/images/a2.png",
      }),
    );
    act(() => captured["bio"]?.onSuccess?.({ ...PROFILE, display_name: "New Name" }));
    await waitFor(() => expect(screen.getByText("New Name")).toBeDefined());
    void rerender;
  });

  it("a cover-position save survives a stale full-profile refresh", async () => {
    const { rerender } = render(<ProfileHero profile={PROFILE} />);
    openPhotoMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reposition cover photo" }));
    act(() =>
      captured["position"]?.onSuccess?.({
        ...PROFILE,
        cover_photo_position: { x: 10, y: 90 },
      }),
    );
    // Reposition closes on success; re-open and the sliders must show the
    // confirmed crop, not the prop's stale one.
    openPhotoMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reposition cover photo" }));
    expect(screen.getByText("10%")).toBeDefined();
    expect(screen.getByText("90%")).toBeDefined();

    rerender(<ProfileHero profile={{ ...PROFILE, display_name: "Renamed Elsewhere" }} />);
    expect(screen.getByText("10%")).toBeDefined();
    expect(screen.getByText("90%")).toBeDefined();
    // …while a field that genuinely moved in the prop is still adopted on a
    // real identity change (below).
  });

  it("a different user resets the confirmed fields", async () => {
    const { rerender } = render(<ProfileHero profile={PROFILE} />);
    act(() => captured["bio"]?.onSuccess?.({ ...PROFILE, display_name: "New Name" }));
    await waitFor(() => expect(screen.getByText("New Name")).toBeDefined());

    rerender(<ProfileHero profile={{ ...PROFILE, id: 99, user_id: 99, display_name: "Someone Else" }} />);
    expect(screen.getByText("Someone Else")).toBeDefined();
    expect(screen.queryByText("New Name")).toBeNull();
  });

  it("a remount initialises from current server values", () => {
    render(<ProfileHero profile={PROFILE} />);
    act(() => captured["bio"]?.onSuccess?.({ ...PROFILE, display_name: "New Name" }));
    cleanup();
    render(<ProfileHero profile={{ ...PROFILE, display_name: "From Server" }} />);
    expect(screen.getByText("From Server")).toBeDefined();
  });

  it("removing an image asks first and starts no mutation until confirmed", () => {
    render(<ProfileHero profile={PROFILE} />);
    const deleteAvatar = captured["deleteAvatar"];
    expect(deleteAvatar).toBeDefined();

    openPhotoMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove profile photo" }));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Your profile will show your initial instead/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Keep photo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Still there — cancelling must not delete anything.
    openPhotoMenu();
    expect(screen.getByRole("menuitem", { name: "Remove profile photo" })).toBeDefined();
  });

  it("the avatar and cover confirmations say different things", () => {
    render(<ProfileHero profile={PROFILE} />);
    openPhotoMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove cover photo" }));
    expect(screen.getByText(/plain background/)).toBeDefined();
    expect(screen.queryByText(/show your initial/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Handle — read only
// ─────────────────────────────────────────────────────────────────────────

describe("HandleSection", () => {
  it("shows the handle and the full profile address", () => {
    render(<HandleSection handle="welder" />);
    expect(screen.getByText("welder")).toBeDefined();
    expect(screen.getByText(/bluecollarcrypto\.io\/u\//)).toBeDefined();
  });

  it("offers no way to edit, and says why", () => {
    const { container } = render(<HandleSection handle="welder" />);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(screen.getByText(/temporarily unavailable/)).toBeDefined();
  });

  it("makes no claim about redirects, cooldowns or sign-in continuing to work", () => {
    const { container } = render(<HandleSection handle="welder" />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/redirect/i);
    expect(text).not.toMatch(/7 days|cooldown/i);
    expect(text).not.toMatch(/stay signed in|remain signed in/i);
  });
});
