/**
 * `bcc_not_found` on an attestation CAST against a page target means the
 * page has no claimed operator to attest to; the cluster says so. Member
 * targets and revokes keep "We couldn't find that vouch." — there the
 * missing thing really is the attestation row.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type Opts = { onError?: (err: unknown) => void };
const hookOpts: { cast: Opts | null; revoke: Opts | null } = { cast: null, revoke: null };

vi.mock("@/hooks/useAttestations", () => ({
  useCastAttestation: (opts: Opts) => {
    hookOpts.cast = opts;
    return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined };
  },
  useRevokeAttestation: (opts: Opts) => {
    hookOpts.revoke = opts;
    return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined };
  },
}));
vi.mock("@/components/profile/SlotHoldersPicker", () => ({
  SlotHoldersPicker: () => null,
}));

const { AttestationActionCluster } = await import(
  "@/components/profile/AttestationActionCluster"
);
const { BccApiError } = await import("@/lib/api/types");
const { ATTESTATION_COPY } = await import("@/lib/copy/trust-layer");

afterEach(cleanup);

const allow = { allowed: true, unlock_hint: null };
const notFound = () => new BccApiError("bcc_not_found", "Target not found.", 404, null);

function renderCluster(targetKind: "validator_card" | "project_card" | "user_profile") {
  return render(
    <AttestationActionCluster
      targetKind={targetKind}
      targetId={77}
      canVouch={allow}
      canStandBehind={allow}
    />,
  );
}

describe("AttestationActionCluster — bcc_not_found copy", () => {
  it.each(["validator_card", "project_card"] as const)(
    "a failed vouch cast on %s renders the unclaimed-page line",
    (kind) => {
      renderCluster(kind);
      fireEvent.click(screen.getByRole("button", { name: /vouch/i }));
      act(() => hookOpts.cast?.onError?.(notFound()));
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toBe(ATTESTATION_COPY.unclaimed_page_target);
      expect(alert.textContent).toBe(
        "This page hasn't been claimed yet, so it can't be vouched for or backed.",
      );
    },
  );

  it("a member target keeps the original copy", () => {
    renderCluster("user_profile");
    act(() => hookOpts.cast?.onError?.(notFound()));
    expect(screen.getByRole("alert").textContent).toBe("We couldn't find that vouch.");
  });

  it("a revoke on a page target keeps the original copy", () => {
    renderCluster("validator_card");
    act(() => hookOpts.revoke?.onError?.(notFound()));
    expect(screen.getByRole("alert").textContent).toBe("We couldn't find that vouch.");
  });
});

describe("AttestationActionCluster — in-app words say 'vouch' (F-264 / F-579)", () => {
  const fail = (code: string) => new BccApiError(code, "RAW SERVER TEXT", 400, null);

  it("the cluster is named in the words its buttons use", () => {
    renderCluster("user_profile");
    expect(screen.getByRole("region", { name: "Vouch, back and report" })).toBeInTheDocument();
  });

  it.each([
    ["bcc_unauthorized", "Sign in to vouch."],
    ["bcc_invalid_request", "We couldn't record that vouch."],
    ["bcc_attestation_self", "You can't vouch for yourself."],
    ["bcc_attestation_fraud_blocked", "Your account is temporarily restricted from vouching."],
    ["bcc_attestation_revoked", "That vouch was already revoked."],
    ["bcc_forbidden", "You can only change your own vouches."],
    ["bcc_something_new", "Couldn't update your vouch. Try again."],
  ])("%s reads %s", (code, copy) => {
    renderCluster("user_profile");
    act(() => hookOpts.cast?.onError?.(fail(code)));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(copy);
    expect(alert.textContent).not.toMatch(/attest/i);
  });
});
