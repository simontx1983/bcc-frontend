/**
 * C1a — settings surfaces now surface a retryable load failure.
 *
 * Before this batch each of these rendered a dead-end line of red text
 * when its read query failed: no way back except a full page reload.
 * They now share `LoadFailure`, and the point of these tests is the part
 * that is easy to get wrong in a bulk migration — **each Retry must call
 * the refetch of the query that actually failed**, not some other query
 * on the page, and not a page reload.
 *
 * Every component is driven through its own hook module, mocked at the
 * boundary so the API client (and its required env vars) stay out of the
 * import graph.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

// ── one refetch spy per query, so we can prove which one was called ───
const refetch = {
  blocks: vi.fn(),
  holderGroups: vi.fn(),
  messagesPrefs: vi.fn(),
  myPrivacy: vi.fn(),
  profilePrefs: vi.fn(),
  profileFields: vi.fn(),
};

/** A failed useQuery result carrying `code`. */
const failed = (code: string, key: keyof typeof refetch) => ({
  isError: true as const,
  isPending: false as const,
  isLoading: false as const,
  isSuccess: false as const,
  data: undefined,
  error: new BccApiError(code, "raw server text that must never render", 500, null),
  refetch: refetch[key],
});

const idleMutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };

vi.mock("@/hooks/useBlocks", () => ({
  useMyBlocks: () => failed("bcc_unavailable", "blocks"),
  useUnblockUser: () => idleMutation,
}));
vi.mock("@/hooks/useHolderGroups", () => ({
  useMyHolderGroups: () => failed("bcc_unavailable", "holderGroups"),
  useHolderGroupPreferences: () => ({ data: undefined, isPending: false }),
  useUpdateHolderGroupPreferences: () => idleMutation,
  useJoinHolderGroupMutation: () => idleMutation,
  useLeaveHolderGroupMutation: () => idleMutation,
}));
vi.mock("@/hooks/useMessagesPrefs", () => ({
  useMessagesPrefs: () => failed(state.messagesPrefsCode, "messagesPrefs"),
  useUpdateMessagesPrefs: () => idleMutation,
}));
vi.mock("@/hooks/useMyPrivacy", () => ({
  useMyPrivacy: () => failed("bcc_unavailable", "myPrivacy"),
  useUpdateMyPrivacy: () => idleMutation,
}));
vi.mock("@/hooks/useProfilePrefs", () => ({
  useProfilePrefs: () => failed(state.profilePrefsCode, "profilePrefs"),
  useUpdateProfilePrefs: () => idleMutation,
}));
// Three C1a files gate Retry on the error code, so their failure codes
// have to be steerable per test. `vi.hoisted` lifts this above the
// `vi.mock` factories that read it.
const state = vi.hoisted(() => ({
  profileFieldsCode: "bcc_peepso_unavailable",
  messagesPrefsCode: "bcc_internal_error",
  profilePrefsCode: "bcc_unavailable",
}));

vi.mock("@/hooks/useProfileFields", () => ({
  useProfileFields: () => failed(state.profileFieldsCode, "profileFields"),
  useUpdateProfileFieldValue: () => idleMutation,
  useUpdateProfileFieldVisibility: () => idleMutation,
}));
// Avatar reaches the API client transitively; BlocksList imports it, and
// a single leaking module poisons the whole file's import graph.
vi.mock("@/components/identity/Avatar", () => ({
  Avatar: () => null,
}));
// ProfileFieldsList imports this with inline `{ type X }` specifiers
// rather than a top-level `import type`, so esbuild erases the bindings
// but keeps the module for side effects — which loads the API client and
// its required env vars. Stubbed to keep it out of the import graph.
vi.mock("@/lib/api/profile-fields-endpoints", () => ({}));

import { BlocksList } from "@/components/settings/BlocksList";
import { CommunitiesList } from "@/components/settings/CommunitiesList";
import { MessagesPrefsForm } from "@/components/settings/MessagesPrefsForm";
import { PrivacySettingsForm } from "@/components/settings/PrivacySettingsForm";
import { MentorSettingsSection } from "@/components/settings/profile/MentorSettingsSection";
import { ProfileFieldsList } from "@/components/settings/profile/ProfileFieldsList";
import { ProfilePrefsSection } from "@/components/settings/profile/ProfilePrefsSection";

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
  state.profileFieldsCode = "bcc_peepso_unavailable";
  state.messagesPrefsCode = "bcc_internal_error";
  state.profilePrefsCode = "bcc_unavailable";
});

afterEach(cleanup);

interface Case {
  name: string;
  ui: React.ReactElement;
  /** The query whose refetch this component's Retry must call. */
  owns: keyof typeof refetch;
  /** Copy that must survive the migration. */
  message: RegExp;
}

const CASES: Case[] = [
  {
    name: "BlocksList",
    ui: <BlocksList />,
    owns: "blocks",
    message: /blocks are temporarily unavailable/i,
  },
  {
    name: "CommunitiesList",
    ui: <CommunitiesList />,
    owns: "holderGroups",
    message: /communities are temporarily unavailable/i,
  },
  {
    name: "MessagesPrefsForm",
    ui: <MessagesPrefsForm />,
    owns: "messagesPrefs",
    message: /couldn't load messages preferences/i,
  },
  {
    name: "PrivacySettingsForm",
    ui: <PrivacySettingsForm />,
    owns: "myPrivacy",
    message: /privacy settings are temporarily unavailable/i,
  },
  {
    name: "MentorSettingsSection",
    ui: <MentorSettingsSection />,
    owns: "profilePrefs",
    message: /could not load mentor settings/i,
  },
  {
    name: "ProfileFieldsList",
    ui: <ProfileFieldsList />,
    owns: "profileFields",
    message: /./,
  },
  {
    name: "ProfilePrefsSection",
    ui: <ProfilePrefsSection />,
    owns: "profilePrefs",
    message: /./,
  },
];

for (const c of CASES) {
  describe(`${c.name} — retryable load failure`, () => {
    it("renders the shared failure state with a Retry control", () => {
      render(c.ui);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    it("preserves the existing error copy", () => {
      render(c.ui);
      expect(screen.getByRole("alert")).toHaveTextContent(c.message);
    });

    it("never renders the raw server message (§γ)", () => {
      render(c.ui);
      expect(screen.getByRole("alert")).not.toHaveTextContent(
        /raw server text that must never render/i,
      );
    });

    it("Retry refetches the query that failed — and only that one", () => {
      render(c.ui);
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      expect(refetch[c.owns]).toHaveBeenCalledTimes(1);
      for (const [key, spy] of Object.entries(refetch)) {
        if (key !== c.owns) expect(spy).not.toHaveBeenCalled();
      }
    });
  });
}

describe("terminal reads get no Retry — the other two gated files", () => {
  // `bcc_invalid_request` reaches three C1a reads via shared ERROR_COPY
  // maps. All three queries take no arguments, so a retry re-issues an
  // identical GET and would fail the same way.
  it("MessagesPrefsForm: bcc_invalid_request offers no Retry", () => {
    state.messagesPrefsCode = "bcc_invalid_request";
    render(<MessagesPrefsForm />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("MessagesPrefsForm: a transient code still offers Retry", () => {
    state.messagesPrefsCode = "bcc_internal_error";
    render(<MessagesPrefsForm />);

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.messagesPrefs).toHaveBeenCalledTimes(1);
  });

  it("ProfilePrefsSection: bcc_invalid_request offers no Retry", () => {
    state.profilePrefsCode = "bcc_invalid_request";
    render(<ProfilePrefsSection />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("ProfilePrefsSection: a transient code still offers Retry", () => {
    state.profilePrefsCode = "bcc_peepso_unavailable";
    render(<ProfilePrefsSection />);

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.profilePrefs).toHaveBeenCalledTimes(1);
  });
});

describe("ProfileFieldsList — terminal reads get no Retry", () => {
  // Its ERROR_COPY is shared with two field mutations, so it carries
  // write-side 400/403/404 codes that could also reach this read.
  // Offering Retry on those would be dishonest — it fails identically.
  const TERMINAL = ["bcc_forbidden", "bcc_not_found", "bcc_invalid_request"] as const;
  const TRANSIENT = [
    "bcc_peepso_unavailable",
    "bcc_internal_error",
    "bcc_rate_limited",
    // 401 is deliberately retryable: a session refreshed in another tab
    // makes the retry genuinely succeed.
    "bcc_unauthorized",
  ] as const;

  for (const code of TERMINAL) {
    it(`${code} explains the boundary with no Retry control`, () => {
      state.profileFieldsCode = code;
      render(<ProfileFieldsList />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
      // and no empty action region / disabled shell left behind
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  }

  for (const code of TRANSIENT) {
    it(`${code} still offers Retry`, () => {
      state.profileFieldsCode = code;
      render(<ProfileFieldsList />);

      const button = screen.getByRole("button", { name: /retry/i });
      fireEvent.click(button);
      expect(refetch.profileFields).toHaveBeenCalledTimes(1);
    });
  }

  it("keeps the code-specific copy on a terminal failure", () => {
    state.profileFieldsCode = "bcc_forbidden";
    render(<ProfileFieldsList />);
    expect(screen.getByRole("alert")).toHaveTextContent(/that field is locked/i);
  });
});

describe("C1a did not touch write failures", () => {
  it("CommunitiesList keeps its mutation error inline, not as a load failure", () => {
    // The auto-join preference's own error is a write failure and must
    // stay next to the control. Only one Retry should exist on the page,
    // and it belongs to the list query.
    render(<CommunitiesList />);
    expect(screen.getAllByRole("button", { name: /retry/i })).toHaveLength(1);
  });
});
