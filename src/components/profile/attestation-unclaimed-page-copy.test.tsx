/**
 * `bcc_not_found` on an attestation CAST against a page target means the
 * page has no claimed operator to attest to; the cluster says so. Member
 * targets and revokes keep "Attestation not found." — there the missing
 * thing really is the attestation row.
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
    expect(screen.getByRole("alert").textContent).toBe("Attestation not found.");
  });

  it("a revoke on a page target keeps the original copy", () => {
    renderCluster("validator_card");
    act(() => hookOpts.revoke?.onError?.(notFound()));
    expect(screen.getByRole("alert").textContent).toBe("Attestation not found.");
  });
});
