/**
 * A failed REFRESH must not erase a loaded settings surface.
 *
 * Each of these branched on the blanket `isError`, which TanStack also
 * sets when a refetch fails while `data` from the last success is still
 * in the cache. Every one of these reads can refetch with data on screen:
 * the list reads are invalidated by their own mutations (unblock,
 * join/leave), and every read has a finite `staleTime`, so revisiting the
 * settings tab within the cache window refetches on mount. One failure
 * there replaced the whole surface — for the two draft forms, hiding an
 * unsaved edit — with an error.
 *
 * The rule (the #183 split, see ActivityPanel):
 *   isLoadingError                     → full failure state, Retry = refetch()
 *   isRefetchError (transient)         → keep the content, inline notice,
 *                                        Retry = refetch()
 *   isRefetchError (permission denial) → full failure state; the server's
 *                                        latest answer is "no", so stale
 *                                        rows are not kept
 *
 * The first-load branch is asserted in detail by
 * settings-load-failure.test.tsx; here it is the control that proves the
 * refetch case is a different branch, not the same one rendered twice.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type NotificationPrefs } from "@/lib/api/types";

const refetch = {
  blocks: vi.fn(),
  holderGroups: vi.fn(),
  messagesPrefs: vi.fn(),
  myPrivacy: vi.fn(),
  profilePrefs: vi.fn(),
  profileFields: vi.fn(),
  notificationPrefs: vi.fn(),
};
type Key = keyof typeof refetch;

const state = vi.hoisted(() => ({
  results: {} as Partial<Record<Key, unknown>>,
}));

const RAW = "raw server text that must never render";
const err = (code: string) => new BccApiError(code, RAW, 503, null);

/** The flags TanStack sets for each branch of a plain useQuery. */
function result(key: Key, branch: "ok" | "first" | "refetch", data: unknown, code = "bcc_unavailable") {
  const failed = branch !== "ok";
  return {
    isPending: false,
    isLoading: false,
    isSuccess: !failed,
    isError: failed,
    isLoadingError: branch === "first",
    isRefetchError: branch === "refetch",
    error: failed ? err(code) : null,
    data: branch === "first" ? undefined : data,
    refetch: refetch[key],
  };
}

const idleMutation = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };

vi.mock("@/hooks/useBlocks", () => ({
  useMyBlocks: () => state.results.blocks,
  useUnblockUser: () => idleMutation,
}));
vi.mock("@/hooks/useHolderGroups", () => ({
  useMyHolderGroups: () => state.results.holderGroups,
  useHolderGroupPreferences: () => ({ data: undefined, isPending: false }),
  useUpdateHolderGroupPreferences: () => idleMutation,
  useJoinHolderGroupMutation: () => idleMutation,
  useLeaveHolderGroupMutation: () => idleMutation,
}));
vi.mock("@/hooks/useMessagesPrefs", () => ({
  useMessagesPrefs: () => state.results.messagesPrefs,
  useUpdateMessagesPrefs: () => idleMutation,
}));
vi.mock("@/hooks/useMyPrivacy", () => ({
  useMyPrivacy: () => state.results.myPrivacy,
  useUpdateMyPrivacy: () => idleMutation,
}));
vi.mock("@/hooks/useProfilePrefs", () => ({
  useProfilePrefs: () => state.results.profilePrefs,
  useUpdateProfilePrefs: () => idleMutation,
}));
vi.mock("@/hooks/useNotificationPrefs", () => ({
  NOTIFICATION_PREFS_QUERY_KEY: ["me", "notification-prefs"],
  useNotificationPrefs: () => state.results.notificationPrefs,
  useUpdateNotificationPrefs: () => idleMutation,
}));
vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    isSupported: false,
    isReady: true,
    enabled: false,
    events: {},
    enable: idleMutation,
    disable: idleMutation,
  }),
}));
vi.mock("@/hooks/useProfileFields", () => ({
  useProfileFields: () => state.results.profileFields,
  useUpdateProfileFieldValue: () => idleMutation,
  useUpdateProfileFieldVisibility: () => idleMutation,
  // A loaded row compares its draft against the server value.
  profileFieldValuesEqual: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
}));
// Same import-graph stubs as settings-load-failure.test.tsx.
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/lib/api/profile-fields-endpoints", () => ({}));

import { BlocksList } from "@/components/settings/BlocksList";
import { CommunitiesList } from "@/components/settings/CommunitiesList";
import { MessagesPrefsForm } from "@/components/settings/MessagesPrefsForm";
import { NotificationPrefsForm } from "@/components/settings/NotificationPrefsForm";
import { PrivacySettingsForm } from "@/components/settings/PrivacySettingsForm";
import { MentorSettingsSection } from "@/components/settings/profile/MentorSettingsSection";
import { ProfileFieldsList } from "@/components/settings/profile/ProfileFieldsList";

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
  for (const spy of Object.values(refetch)) spy.mockClear();
  state.results = {};
});

afterEach(cleanup);

// ── loaded payloads ───────────────────────────────────────────────────

const BLOCKS = {
  items: [{ user_id: 9, handle: "rivet", display_name: "Rivet Rosie", avatar_url: "" }],
  pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
};
const HOLDER_GROUPS = { joined: [], eligible_to_join: [], opted_out: [] };
const MESSAGES = { chat_enabled: true, chat_friends_only: false };
const PRIVACY = {
  watching_hidden: false,
  reviews_hidden: false,
  disputes_hidden: false,
  delegations_hidden: false,
  follower_count_hidden: false,
  real_name_hidden: false,
  email_hidden: false,
  discovery_optout: false,
};
const NOTIFICATIONS: NotificationPrefs = {
  email_digest: true,
  bell: {} as NotificationPrefs["bell"],
  push: { enabled: false, events: {} as NotificationPrefs["push"]["events"] },
  push_available: false,
};
const MENTOR = { mentor_opt_in: true, mentor_listed: true, mentor_eligibility_reason: null };
const FIELDS = {
  fields: [
    {
      key: "trade",
      label: "Trade",
      help_text: null,
      type: "text",
      value: "welder",
      visibility: "private",
      visibility_locked: false,
      editable: true,
      required: false,
      max_length: null,
      options: [],
      order: 1,
    },
  ],
  stats: { filled: 1, total: 1, completeness: 100 },
};

interface Case {
  name: string;
  key: Key;
  data: unknown;
  ui: () => React.ReactElement;
  /** Something only the LOADED surface renders. */
  content: () => HTMLElement | null;
}

const CASES: Case[] = [
  {
    name: "BlocksList",
    key: "blocks",
    data: BLOCKS,
    ui: () => <BlocksList />,
    content: () => screen.queryByText("Rivet Rosie"),
  },
  {
    name: "CommunitiesList",
    key: "holderGroups",
    data: HOLDER_GROUPS,
    ui: () => <CommunitiesList />,
    content: () => screen.queryByText("Eligible communities"),
  },
  {
    name: "MessagesPrefsForm",
    key: "messagesPrefs",
    data: MESSAGES,
    ui: () => <MessagesPrefsForm />,
    content: () => screen.queryByText("Direct messages"),
  },
  {
    name: "PrivacySettingsForm",
    key: "myPrivacy",
    data: PRIVACY,
    ui: () => <PrivacySettingsForm />,
    content: () => screen.queryAllByRole("switch")[0] ?? null,
  },
  {
    name: "NotificationPrefsForm",
    key: "notificationPrefs",
    data: NOTIFICATIONS,
    ui: () => <NotificationPrefsForm />,
    content: () => screen.queryByText("Weekly email digest"),
  },
  {
    name: "MentorSettingsSection",
    key: "profilePrefs",
    data: MENTOR,
    ui: () => <MentorSettingsSection />,
    content: () => screen.queryByRole("switch", { name: /mentor listing/i }),
  },
  {
    name: "ProfileFieldsList",
    key: "profileFields",
    data: FIELDS,
    ui: () => <ProfileFieldsList />,
    content: () => screen.queryByText("COMPLETENESS"),
  },
];

for (const c of CASES) {
  describe(`${c.name} — failed refresh`, () => {
    it("keeps the loaded content on screen when a REFRESH fails", () => {
      state.results[c.key] = result(c.key, "refetch", c.data);
      render(c.ui());
      expect(c.content()).not.toBeNull();
    });

    it("says so inline, with a Retry that refetches the same query", () => {
      state.results[c.key] = result(c.key, "refetch", c.data);
      render(c.ui());
      const alert = screen.getByRole("alert");
      expect(alert.textContent ?? "").not.toContain(RAW);
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      expect(refetch[c.key]).toHaveBeenCalledTimes(1);
    });

    it("a FIRST-load failure still replaces the surface with the error state", () => {
      state.results[c.key] = result(c.key, "first", c.data);
      render(c.ui());
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(c.content()).toBeNull();
    });

    it("a REFUSED refresh is not kept: the server said no", () => {
      state.results[c.key] = result(c.key, "refetch", c.data, "bcc_forbidden");
      render(c.ui());
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(c.content()).toBeNull();
    });
  });
}

describe("a failed refresh does not assert an empty server", () => {
  it("BlocksList withholds NONE ON FILE when the empty list may be stale", () => {
    state.results.blocks = result("blocks", "refetch", {
      ...BLOCKS,
      items: [],
    });
    render(<BlocksList />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/none on file/i)).toBeNull();
  });

  it("ProfileFieldsList withholds 'nothing configured' when the list may be stale", () => {
    state.results.profileFields = result("profileFields", "refetch", {
      ...FIELDS,
      fields: [],
    });
    render(<ProfileFieldsList />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/hasn.t configured any profile fields/i)).toBeNull();
  });
});

describe("NotificationPrefsForm keeps an unsaved draft through a failed refresh", () => {
  it("the edited toggle survives the refresh failure", () => {
    state.results.notificationPrefs = result("notificationPrefs", "ok", NOTIFICATIONS);
    const view = render(<NotificationPrefsForm />);
    const digest = screen.getByRole("checkbox", { name: /email me a weekly digest/i });
    expect(digest).toBeChecked();
    fireEvent.click(digest);
    expect(digest).not.toBeChecked();

    state.results.notificationPrefs = result("notificationPrefs", "refetch", NOTIFICATIONS);
    view.rerender(<NotificationPrefsForm />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      within(document.body).getByRole("checkbox", { name: /email me a weekly digest/i }),
    ).not.toBeChecked();
  });
});
