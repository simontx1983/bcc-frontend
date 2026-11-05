/**
 * The validator page's delegator-group panel: what each server state shows,
 * and what the create and edit dialogs actually send and say.
 *
 * The API client is the only thing faked, so these assert the real path and
 * body the endpoint wrapper produces, not merely that a mock hook was called.
 * Fixtures only; nothing here talks to a server.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BccApiError,
  type DelegatorGroupBlock,
  type DelegatorGroupOption,
} from "@/lib/api/types";

const bccFetchAsClient = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({ bccFetchAsClient }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
// jsdom has no matchMedia; the Dialog's reduced-motion hook calls it.
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

import { DelegatorGroupPanel } from "@/components/entity/panels/DelegatorGroupPanel";

const PAGE_ID = 42;
const PATH = `pages/${PAGE_ID}/delegator-group`;

const COSMOS: DelegatorGroupOption = {
  validator_id: 7,
  name: "Acme Staking",
  chain_slug: "cosmos",
  chain_name: "Cosmos Hub",
  native_token: "atom",
};
const OSMOSIS: DelegatorGroupOption = {
  validator_id: 8,
  name: "Acme Osmo",
  chain_slug: "osmosis",
  chain_name: "Osmosis",
  native_token: "osmo",
};

const EXISTING = {
  id: 99,
  slug: "delegators-acme",
  url: "/communities/delegators-acme",
  min_stake: "5.5",
  min_stake_display: "5.5 ATOM",
  validator: {
    id: 7,
    name: "Acme Staking",
    chain_slug: "cosmos",
    chain_name: "Cosmos Hub",
  },
};

function block(overrides: Partial<DelegatorGroupBlock> = {}): DelegatorGroupBlock {
  return {
    group: null,
    can_create: false,
    can_edit_min_stake: false,
    options: [COSMOS],
    unavailable_reason: null,
    ...overrides,
  };
}

function apiError(code: string, status: number, data?: Record<string, unknown>) {
  return new BccApiError(
    code,
    "server wording that must never be shown",
    status,
    data !== undefined
      ? { error: { code, message: "x", status, data }, _meta: { version: "v1" } }
      : null,
  );
}

function renderPanel(value: DelegatorGroupBlock) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DelegatorGroupPanel pageId={PAGE_ID} pageName="Acme" block={value} />
    </QueryClientProvider>,
  );
}

function openCreate() {
  fireEvent.click(screen.getByRole("button", { name: "CREATE DELEGATOR GROUP" }));
  return screen.getByRole("dialog");
}

function openEdit() {
  fireEvent.click(screen.getByRole("button", { name: "EDIT MINIMUM" }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  bccFetchAsClient.mockReset();
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("panel states", () => {
  it("links a visitor to an existing group, names its minimum, and offers no edit", () => {
    renderPanel(block({ group: EXISTING }));

    const link = screen.getByRole("link", { name: "VIEW DELEGATOR GROUP" });
    expect(link).toHaveAttribute("href", "/communities/delegators-acme");
    expect(screen.getByText("Minimum delegation: 5.5 ATOM")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says which validator and chain the group serves", () => {
    renderPanel(block({ group: EXISTING }));

    expect(screen.getByText("For Acme Staking on Cosmos Hub")).toBeInTheDocument();
  });

  it("never prints an operator address, even if one reaches the wire", () => {
    const withAddress = {
      ...EXISTING,
      validator: { ...EXISTING.validator, operator_address: "cosmosvaloper1fixture" },
    };
    const { container } = renderPanel(block({ group: withAddress, can_edit_min_stake: true }));

    expect(container).not.toHaveTextContent("cosmosvaloper1fixture");
  });

  it("drops the line, and keeps the link, when the validator block is null", () => {
    renderPanel(block({ group: { ...EXISTING, validator: null } }));

    expect(screen.queryByText(/^For /)).toBeNull();
    expect(screen.getByRole("link", { name: "VIEW DELEGATOR GROUP" })).toBeInTheDocument();
  });

  it("still links when the minimum can't be displayed, without a blank line", () => {
    renderPanel(block({ group: { ...EXISTING, min_stake_display: null } }));

    expect(screen.getByRole("link", { name: "VIEW DELEGATOR GROUP" })).toBeInTheDocument();
    expect(screen.queryByText(/Minimum delegation/)).toBeNull();
  });

  it("offers edit only when the server grants can_edit_min_stake", () => {
    renderPanel(block({ group: EXISTING, can_edit_min_stake: true }));

    expect(screen.getByRole("button", { name: "EDIT MINIMUM" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CREATE DELEGATOR GROUP" })).toBeNull();
  });

  it("offers create only when the server grants can_create", () => {
    renderPanel(block({ can_create: true }));

    expect(screen.getByRole("button", { name: "CREATE DELEGATOR GROUP" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: "EDIT MINIMUM" })).toBeNull();
  });

  it("explains an unsupported chain in the server's words, with no dead button", () => {
    const reason = "Delegator groups aren't available on Solana yet.";
    renderPanel(block({ options: [], unavailable_reason: reason }));

    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing for a visitor on a supported chain with no group", () => {
    const { container } = renderPanel(block());

    expect(container).toBeEmptyDOMElement();
  });

  it("offers no create form that has nothing to create for", () => {
    const { container } = renderPanel(block({ can_create: true, options: [] }));

    expect(container).toBeEmptyDOMElement();
  });
});

describe("create dialog", () => {
  it("prefills a minimum of 1, shows the chain's token, and has no chain picker", () => {
    renderPanel(block({ can_create: true }));

    const dialog = openCreate();
    expect(within(dialog).getByLabelText("MINIMUM DELEGATION (ATOM)")).toHaveValue("1");
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    expect(
      within(dialog).getByText("For delegators of Acme Staking on Cosmos Hub."),
    ).toBeInTheDocument();
  });

  it("posts validator_id and min_stake, then shows the new group", async () => {
    bccFetchAsClient.mockResolvedValue({
      group: { ...EXISTING, min_stake: "2.5", min_stake_display: "2.5 ATOM" },
    });
    renderPanel(block({ can_create: true }));

    const dialog = openCreate();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "2.5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "CREATE GROUP" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bccFetchAsClient).toHaveBeenCalledTimes(1);
    expect(bccFetchAsClient).toHaveBeenCalledWith(PATH, {
      method: "POST",
      body: { validator_id: 7, min_stake: "2.5" },
    });
    expect(screen.getByRole("link", { name: "VIEW DELEGATOR GROUP" })).toHaveAttribute(
      "href",
      "/communities/delegators-acme",
    );
    expect(screen.getByText("Minimum delegation: 2.5 ATOM")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("with several options, picks the chain, follows its token, and sends its validator", async () => {
    bccFetchAsClient.mockResolvedValue({ group: EXISTING });
    renderPanel(block({ can_create: true, options: [COSMOS, OSMOSIS] }));

    const dialog = openCreate();
    expect(within(dialog).getByLabelText("MINIMUM DELEGATION (ATOM)")).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Acme Staking on Cosmos Hub", "Acme Osmo on Osmosis"]);
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "8" } });
    expect(within(dialog).getByLabelText("MINIMUM DELEGATION (OSMO)")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "CREATE GROUP" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bccFetchAsClient).toHaveBeenCalledWith(PATH, {
      method: "POST",
      body: { validator_id: 8, min_stake: "1" },
    });
  });

  it("labels an option with the page title only when it has no name", () => {
    const unnamed: DelegatorGroupOption = {
      validator_id: 8,
      chain_slug: "osmosis",
      chain_name: "Osmosis",
      native_token: "osmo",
    };
    renderPanel(block({ can_create: true, options: [COSMOS, unnamed] }));

    expect(
      within(openCreate())
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Acme Staking on Cosmos Hub", "Acme on Osmosis"]);
  });

  it("does not submit an empty minimum", () => {
    renderPanel(block({ can_create: true }));

    const dialog = openCreate();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "  " } });

    expect(within(dialog).getByRole("button", { name: "CREATE GROUP" })).toBeDisabled();
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
    expect(bccFetchAsClient).not.toHaveBeenCalled();
  });

  it("tells a suspended operator it's the suspension, not the operator check", async () => {
    bccFetchAsClient.mockRejectedValue(apiError("bcc_forbidden", 403));
    renderPanel(block({ can_create: true }));

    const dialog = openCreate();
    fireEvent.click(within(dialog).getByRole("button", { name: "CREATE GROUP" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Your account is suspended");
    expect(alert).not.toHaveTextContent("verified operator");
    expect(within(dialog).queryByRole("button", { name: "CREATE GROUP" })).toBeNull();
  });

  it("explains a 503 and leaves the retry available", async () => {
    bccFetchAsClient.mockRejectedValue(apiError("bcc_internal_error", 503));
    renderPanel(block({ can_create: true }));

    const dialog = openCreate();
    fireEvent.click(within(dialog).getByRole("button", { name: "CREATE GROUP" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The group couldn't be saved just now. Try again in a moment.",
    );
    expect(within(dialog).getByRole("button", { name: "CREATE GROUP" })).toBeEnabled();
  });

  it("explains a not_claimer 403 and offers no retry", async () => {
    bccFetchAsClient.mockRejectedValue(
      apiError("bcc_forbidden", 403, { reason_code: "not_claimer" }),
    );
    renderPanel(block({ can_create: true }));

    const dialog = openCreate();
    fireEvent.click(within(dialog).getByRole("button", { name: "CREATE GROUP" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You're not the verified operator of this validator any more.",
    );
    expect(screen.queryByText(/server wording/)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "CREATE GROUP" })).toBeNull();
    // Re-read only on close, so the explanation isn't pulled away mid-read.
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "CLOSE" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("explains a 409 and links to the group the server says exists", async () => {
    bccFetchAsClient.mockRejectedValue(apiError("bcc_conflict", 409, { group: EXISTING }));
    renderPanel(block({ can_create: true }));

    const dialog = openCreate();
    fireEvent.click(within(dialog).getByRole("button", { name: "CREATE GROUP" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("This page already has a delegator group.");
    expect(within(alert).getByRole("link", { name: "View the group" })).toHaveAttribute(
      "href",
      "/communities/delegators-acme",
    );
    expect(within(dialog).queryByRole("button", { name: "CREATE GROUP" })).toBeNull();

    // The panel behind it is already the link; closing leaves that in place.
    fireEvent.click(within(dialog).getByRole("button", { name: "CLOSE" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: "VIEW DELEGATOR GROUP" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("still explains a 409 whose data.group is unusable", async () => {
    bccFetchAsClient.mockRejectedValue(apiError("bcc_conflict", 409, { group: { id: "nope" } }));
    renderPanel(block({ can_create: true }));

    const dialog = openCreate();
    fireEvent.click(within(dialog).getByRole("button", { name: "CREATE GROUP" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("already has a delegator group");
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it("lets the operator correct a 422, and clears the error as they type", async () => {
    bccFetchAsClient.mockRejectedValueOnce(apiError("bcc_invalid_request", 422));
    bccFetchAsClient.mockResolvedValueOnce({ group: EXISTING });
    renderPanel(block({ can_create: true }));

    const dialog = openCreate();
    const input = within(dialog).getByRole("textbox");
    fireEvent.change(input, { target: { value: "1e5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "CREATE GROUP" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Enter the minimum as a plain positive number",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, { target: { value: "5" } });
    await waitFor(() => expect(within(dialog).queryByRole("alert")).toBeNull());
    fireEvent.click(within(dialog).getByRole("button", { name: "CREATE GROUP" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bccFetchAsClient).toHaveBeenLastCalledWith(PATH, {
      method: "POST",
      body: { validator_id: 7, min_stake: "5" },
    });
  });
});

describe("edit dialog", () => {
  const editable = () => block({ group: EXISTING, can_edit_min_stake: true });

  it("prefills the raw minimum, not the display string", () => {
    renderPanel(editable());

    expect(within(openEdit()).getByRole("textbox")).toHaveValue("5.5");
  });

  it("states what raising and lowering do before anything is saved", () => {
    renderPanel(editable());

    const consequence = within(openEdit()).getByTestId("delegator-minimum-consequence");
    expect(consequence).toHaveTextContent(
      "If you raise the minimum, members below it are removed by automatic checks.",
    );
    expect(consequence).toHaveTextContent(
      "These run twice a day in batches, so it can take several runs, and days for large groups.",
    );
    expect(consequence).toHaveTextContent(
      "Removed members are told in the app, unless they’ve turned that notice off, and can rejoin once they delegate enough.",
    );
    expect(consequence).toHaveTextContent("Lowering it removes nobody.");
    expect(bccFetchAsClient).not.toHaveBeenCalled();
  });

  it("patches only min_stake, then shows the new minimum", async () => {
    bccFetchAsClient.mockResolvedValue({
      group: { ...EXISTING, min_stake: "10", min_stake_display: "10 ATOM" },
    });
    renderPanel(editable());

    const dialog = openEdit();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "SAVE MINIMUM" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bccFetchAsClient).toHaveBeenCalledTimes(1);
    expect(bccFetchAsClient).toHaveBeenCalledWith(PATH, {
      method: "PATCH",
      body: { min_stake: "10" },
    });
    expect(screen.getByText("Minimum delegation: 10 ATOM")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("tells a suspended operator it's the suspension, not the operator check", async () => {
    bccFetchAsClient.mockRejectedValue(apiError("bcc_forbidden", 403));
    renderPanel(editable());

    const dialog = openEdit();
    fireEvent.click(within(dialog).getByRole("button", { name: "SAVE MINIMUM" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Your account is suspended");
    expect(alert).not.toHaveTextContent("verified operator");
  });

  it("explains a 503 and leaves the retry available", async () => {
    bccFetchAsClient.mockRejectedValue(apiError("bcc_internal_error", 503));
    renderPanel(editable());

    const dialog = openEdit();
    fireEvent.click(within(dialog).getByRole("button", { name: "SAVE MINIMUM" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The minimum couldn't be saved just now. Try again in a moment.",
    );
    expect(within(dialog).getByRole("button", { name: "SAVE MINIMUM" })).toBeEnabled();
  });

  it("explains a not_claimer 403 and offers no retry", async () => {
    bccFetchAsClient.mockRejectedValue(
      apiError("bcc_forbidden", 403, { reason_code: "not_claimer" }),
    );
    renderPanel(editable());

    const dialog = openEdit();
    fireEvent.click(within(dialog).getByRole("button", { name: "SAVE MINIMUM" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You're not the verified operator of this validator any more.",
    );
    expect(within(dialog).queryByRole("button", { name: "SAVE MINIMUM" })).toBeNull();
    expect(screen.getByText("Minimum delegation: 5.5 ATOM")).toBeInTheDocument();
  });

  it("explains a 422 and keeps the form usable", async () => {
    bccFetchAsClient.mockRejectedValue(apiError("bcc_invalid_request", 422));
    renderPanel(editable());

    const dialog = openEdit();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "SAVE MINIMUM" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Enter the minimum as a plain positive number",
    );
    expect(within(dialog).getByRole("button", { name: "SAVE MINIMUM" })).toBeEnabled();
    expect(screen.getByText("Minimum delegation: 5.5 ATOM")).toBeInTheDocument();
  });
});
