/**
 * Validator Audit History (global) — validator admin V1, PR A.
 *
 * Real component, real hook, real QueryClient; the endpoint module and
 * next/navigation are the only stand-ins. Pinned:
 *   - security D5: evidence_note / evidence_ref render as TEXT. No <a>,
 *     no parsed markup, whatever the value — a plain URL and a
 *     `javascript:` URL included. evidence_ref gets a Copy button, and a
 *     refused clipboard write is caught and reported;
 *   - page id / user id filters round-trip through the URL;
 *   - Load more sends the server's cursor;
 *   - 403 / 404 failure panels.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type {
  ValidatorRelationshipHistoryItem,
  ValidatorRelationshipHistoryResponse,
} from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const nav = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/validators/history",
  useSearchParams: () => nav.searchParams,
}));

const getHistory = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/admin-validator-endpoints", () => ({
  getAdminValidatorDirectory: vi.fn(),
  getValidatorRelationshipHistory: (...a: unknown[]) => getHistory(...a),
  getValidatorRelationshipHealth: vi.fn(),
}));

import { ADMIN_ID_NOT_FOUND_COPY } from "@/components/admin/validators/AdminReadFailure";
import { DELETED_ACCOUNT_COPY, SYSTEM_ACTOR_COPY } from "@/components/admin/validators/HistoryRow";
import { RelationshipHistory } from "@/components/admin/validators/RelationshipHistory";

const writeText = vi.fn();

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
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: (...a: unknown[]) => writeText(...a) },
    configurable: true,
  });
});

beforeEach(() => {
  getHistory.mockReset();
  nav.replace.mockReset();
  writeText.mockReset();
  nav.searchParams = new URLSearchParams();
});

afterEach(cleanup);

const RAW = "raw server text that must never render";

const ADA = { user_id: 9, handle: "ada", display_name: "Ada Lovelace", avatar_url: null };
const GRACE = { user_id: 3, handle: "grace", display_name: "Grace Hopper", avatar_url: null };

function entry(id: number, over: Partial<ValidatorRelationshipHistoryItem> = {}): ValidatorRelationshipHistoryItem {
  return {
    id,
    created_at: "2026-11-20T10:00:00Z",
    action: "linked",
    subject: ADA,
    actor: GRACE,
    page: { page_id: 40 + id, title: `Validator ${id}` },
    prev: { role: null, status: null, method: null },
    new: { role: "owner", status: "active", method: "keybase" },
    reason: null,
    reason_label: null,
    evidence_note: null,
    evidence_ref: null,
    step_up: "password+code",
    ...over,
  };
}

function page(
  items: ValidatorRelationshipHistoryItem[],
  more: { next_cursor: string | null; has_more: boolean } = { next_cursor: null, has_more: false },
): ValidatorRelationshipHistoryResponse {
  return { items, pagination: more };
}

function renderHistory() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = () => (
    <QueryClientProvider client={qc}>
      <RelationshipHistory />
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, rerenderHistory: () => view.rerender(ui()) };
}

const paramsOf = (n: number) => getHistory.mock.calls[n]?.[0] as Record<string, unknown>;
const lastParams = () => paramsOf(getHistory.mock.calls.length - 1);
const rowOf = (pageTitle: string) => screen.getByText(pageTitle).closest("li") as HTMLElement;

describe("Audit history — unfamiliar actions", () => {
  it.each(["owner_released", "constructor", "__proto__"])("renders %s as text without treating inherited properties as labels", async (action) => {
    getHistory.mockResolvedValue(page([entry(1, { action })]));
    renderHistory();
    expect(await screen.findByText(action.toUpperCase())).toBeInTheDocument();
    expect(screen.getByText("Validator 1")).toBeInTheDocument();
  });
});

describe("Audit history — evidence is plain text (security D5)", () => {
  const HOSTILE_NOTE = '<img src="x" onerror="alert(1)"> see <a href="https://evil.example">this</a>';

  it("never renders an <a>, nor any markup, for URL-shaped or script-shaped evidence", async () => {
    getHistory.mockResolvedValue(
      page([
        entry(1, { evidence_ref: "https://example.com", evidence_note: "Proof at https://example.com/proof" }),
        entry(2, { evidence_ref: "javascript:alert(1)", evidence_note: HOSTILE_NOTE }),
      ]),
    );
    const { container } = renderHistory();
    await screen.findByText("Validator 1");

    // The values are on screen, verbatim, as text.
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
    expect(screen.getByText("Proof at https://example.com/proof")).toBeInTheDocument();
    expect(screen.getByText(HOSTILE_NOTE)).toBeInTheDocument();

    // …and nothing was turned into a link or parsed as HTML.
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[href]")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("evidence_ref has a Copy button that writes the exact value", async () => {
    writeText.mockResolvedValue(undefined);
    getHistory.mockResolvedValue(page([entry(1, { evidence_ref: "https://example.com" })]));
    renderHistory();
    await screen.findByText("Validator 1");

    fireEvent.click(screen.getByRole("button", { name: "Copy evidence reference for entry #1" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Evidence reference for entry #1 copied."),
    );
    expect(writeText).toHaveBeenCalledWith("https://example.com");
  });

  it("a refused clipboard write is caught and reported, not thrown", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    getHistory.mockResolvedValue(page([entry(1, { evidence_ref: "ref-123" })]));
    renderHistory();
    await screen.findByText("Validator 1");

    fireEvent.click(screen.getByRole("button", { name: "Copy evidence reference for entry #1" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Couldn't copy the evidence reference for entry #1.",
      ),
    );
  });

  it("an entry with no evidence shows no evidence fields and no Copy button", async () => {
    getHistory.mockResolvedValue(page([entry(1)]));
    renderHistory();
    await screen.findByText("Validator 1");
    expect(screen.queryByText("EVIDENCE NOTE")).toBeNull();
    expect(screen.queryByText("EVIDENCE REFERENCE")).toBeNull();
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
  });
});

describe("Audit history — rows", () => {
  it("shows the action, page, subject, actor, before → after, reason and step-up", async () => {
    getHistory.mockResolvedValue(
      page([
        entry(1, {
          action: "revoked",
          prev: { role: "owner", status: "active", method: "website" },
          new: { role: null, status: "revoked", method: null },
          reason: "evidence_withdrawn",
          reason_label: "Evidence withdrawn",
          step_up: "password",
        }),
      ]),
    );
    renderHistory();
    await screen.findByText("Validator 1");
    const row = rowOf("Validator 1");

    expect(within(row).getByText("OWNER REVOKED")).toBeInTheDocument();
    expect(within(row).getByText("page #41")).toBeInTheDocument();
    expect(within(row).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(row).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(row).getByText("owner → —")).toBeInTheDocument();
    expect(within(row).getByText("active → revoked")).toBeInTheDocument();
    expect(within(row).getByText("Website → —")).toBeInTheDocument();
    expect(within(row).getByText("Evidence withdrawn")).toBeInTheDocument();
    expect(within(row).queryByText("evidence_withdrawn")).toBeNull();
    expect(within(row).getByText("Password")).toBeInTheDocument();
    expect(row.querySelector("time")).toHaveAttribute("datetime", "2026-11-20T10:00:00Z");
  });
});

describe("Audit history — deleted accounts and system events", () => {
  it("a null subject reads 'Deleted account' and a null actor reads 'System'", async () => {
    getHistory.mockResolvedValue(
      page([entry(2, { action: "account_deleted", subject: null, actor: null, step_up: null })]),
    );
    renderHistory();
    await screen.findByText("Validator 2");
    const row = rowOf("Validator 2");

    expect(within(row).getByText(DELETED_ACCOUNT_COPY)).toBeInTheDocument();
    expect(within(row).getByText(SYSTEM_ACTOR_COPY)).toBeInTheDocument();
    expect(within(row).queryByText("Ada Lovelace")).toBeNull();
    expect(within(row).queryByText("Grace Hopper")).toBeNull();
  });
});

describe("Audit history — filters live in the URL", () => {
  it("reads page_id and user_id from the URL into the request and the inputs", async () => {
    nav.searchParams = new URLSearchParams("page_id=12&user_id=7");
    getHistory.mockResolvedValue(page([entry(1)]));
    renderHistory();
    await screen.findByText("Validator 1");

    expect(paramsOf(0)).toEqual({ limit: 25, pageId: 12, userId: 7 });
    expect(screen.getByLabelText("PAGE ID")).toHaveValue(12);
    expect(screen.getByLabelText("USER ID")).toHaveValue(7);
  });

  it("ignores a malformed id in the URL rather than sending it", async () => {
    nav.searchParams = new URLSearchParams("page_id=abc&user_id=-3");
    getHistory.mockResolvedValue(page([entry(1)]));
    renderHistory();
    await screen.findByText("Validator 1");
    expect(paramsOf(0)).toEqual({ limit: 25 });
  });

  it("Apply writes the filters to the URL, and the URL drives the next read", async () => {
    getHistory.mockResolvedValue(page([entry(1)]));
    const { rerenderHistory } = renderHistory();
    await screen.findByText("Validator 1");
    expect(paramsOf(0)).toEqual({ limit: 25 });

    fireEvent.change(screen.getByLabelText("PAGE ID"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("USER ID"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(nav.replace).toHaveBeenCalledWith("/admin/validators/history?page_id=5&user_id=9", {
      scroll: false,
    });
    // Typing alone does not query; only the URL does.
    expect(getHistory).toHaveBeenCalledTimes(1);

    // The router applies the URL; the component re-reads it.
    getHistory.mockResolvedValue(page([entry(2)]));
    nav.searchParams = new URLSearchParams("page_id=5&user_id=9");
    rerenderHistory();
    await screen.findByText("Validator 2");
    expect(lastParams()).toEqual({ limit: 25, pageId: 5, userId: 9 });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/admin/validators/history", { scroll: false });
  });

  it("an empty filtered result offers Clear filters, which clears the URL", async () => {
    nav.searchParams = new URLSearchParams("user_id=99");
    getHistory.mockResolvedValue(page([]));
    renderHistory();

    expect(await screen.findByText("No history for these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CLEAR FILTERS" }));
    expect(nav.replace).toHaveBeenCalledWith("/admin/validators/history", { scroll: false });
  });
});

describe("Audit history — paging and failures", () => {
  it("Load more requests the server's cursor, keeping the filters", async () => {
    nav.searchParams = new URLSearchParams("page_id=12");
    getHistory.mockResolvedValueOnce(page([entry(1)], { next_cursor: "h-2", has_more: true }));
    renderHistory();
    await screen.findByText("Validator 1");

    getHistory.mockResolvedValueOnce(page([entry(2)]));
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await screen.findByText("Validator 2");

    expect(paramsOf(1)).toEqual({ limit: 25, pageId: 12, cursor: "h-2" });
    expect(screen.getByText("Validator 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("a 403 shows the Admin access required panel and no filters", async () => {
    getHistory.mockRejectedValue(new BccApiError("rest_forbidden", RAW, 403, null));
    renderHistory();
    expect(await screen.findByText(/admin access required/i)).toBeInTheDocument();
    expect(screen.getByText(/the validator audit history is restricted to platform admins/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it("a 404 rest_no_route says the tool isn't on the server yet", async () => {
    getHistory.mockRejectedValue(new BccApiError("rest_no_route", RAW, 404, null));
    renderHistory();
    expect(await screen.findByText("This tool isn't available on the server yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(getHistory).toHaveBeenCalledTimes(1);
  });

  it("a 404 bcc_not_found on an id filter says no page or member matches, and keeps the filters to fix it", async () => {
    nav.searchParams = new URLSearchParams("page_id=999999");
    getHistory.mockRejectedValue(new BccApiError("bcc_not_found", RAW, 404, null));
    renderHistory();
    expect(await screen.findByText(ADMIN_ID_NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.queryByText("This tool isn't available on the server yet.")).toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    // The filter form stays, so the id can be corrected.
    expect(screen.getByDisplayValue("999999")).toBeInTheDocument();
    expect(getHistory).toHaveBeenCalledTimes(1);
  });
});
