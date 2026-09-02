/**
 * field-save-outcome — what one profile-field row should say after a save.
 *
 * A row saves its value and its visibility as two independent mutations,
 * so "did that save?" has more than two answers. This turns the pair into
 * a single honest statement.
 *
 * Two rules drive everything here:
 *
 *   1. **Never report a bare success while a requested part failed.** A
 *      row that says "Saved" after the visibility write was rejected has
 *      lied about what is on the server.
 *
 *   2. **Only reason about halves that were actually requested.** React
 *      Query keeps `isSuccess` / `isError` from the previous attempt, so
 *      retrying just the failed half would otherwise read the other
 *      half's stale success and report the wrong thing. The caller
 *      captures `requested` at the start of each save; anything not
 *      requested is invisible to this function.
 *
 * Pure and dependency-free so both arrival orders can be tested directly
 * without rendering or faking a network.
 */

/** One half's state, as far as this row is concerned. */
export type HalfOutcome = "not-requested" | "pending" | "ok" | "error";

export interface MutationLike {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
}

export interface RowSaveInput {
  requestedValue: boolean;
  requestedVisibility: boolean;
  value: MutationLike;
  visibility: MutationLike;
}

/**
 * `status` drives the polite region; `errorMessage` is rendered in a
 * separate alert. They are mutually exclusive by construction — `status`
 * is never `"error"`, so the polite region stays silent while an alert
 * speaks, and one outcome is never announced twice.
 */
export interface RowSaveOutcome {
  status: "idle" | "saving" | "saved";
  errorMessage: string | null;
}

export function halfOutcome(requested: boolean, m: MutationLike): HalfOutcome {
  if (!requested) return "not-requested";
  if (m.isError) return "error";
  if (m.isSuccess) return "ok";
  // Requested but not yet resolved. Covers the render between `mutate()`
  // and `isPending` flipping, which would otherwise read as idle.
  return "pending";
}

export function rowSaveOutcome(input: RowSaveInput): RowSaveOutcome {
  const v = halfOutcome(input.requestedValue, input.value);
  const s = halfOutcome(input.requestedVisibility, input.visibility);

  if (v === "not-requested" && s === "not-requested") {
    return { status: "idle", errorMessage: null };
  }
  if (v === "pending" || s === "pending") {
    return { status: "saving", errorMessage: null };
  }

  const valueFailed = v === "error";
  const visibilityFailed = s === "error";

  if (!valueFailed && !visibilityFailed) {
    return { status: "saved", errorMessage: null };
  }

  // Partial and total failures. The wording names what did land, because
  // "couldn't save" alone would imply the whole row was rejected.
  if (valueFailed && visibilityFailed) {
    return { status: "idle", errorMessage: "Couldn't save. Try again." };
  }
  if (valueFailed) {
    return {
      status: "idle",
      errorMessage:
        s === "ok"
          ? "Changed who can see it, but couldn't save your answer. Try again."
          : "Couldn't save your answer. Try again.",
    };
  }
  return {
    status: "idle",
    errorMessage:
      v === "ok"
        ? "Saved your answer, but couldn't change who can see it. Try again."
        : "Couldn't change who can see it. Try again.",
  };
}
