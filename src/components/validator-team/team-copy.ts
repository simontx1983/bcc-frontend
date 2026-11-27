/**
 * Copy for the validator team screens, and the error → copy mapping
 * every team write shares.
 *
 * §γ: copy is keyed on `err.code` and `data.reason`, never the server's
 * message. Every refusal of an invitee is ONE generic line by design
 * (`invite_not_possible`): the screen must not hint at why (a block, a
 * suspension, a missing account).
 */

import {
  conflictReason,
  forbiddenReason,
  isAdminDenial,
  isAdminToolUnavailable,
} from "@/lib/api/admin-errors";
import { isCode, isServiceUnavailable, retryAfterSeconds } from "@/lib/api/errors";
import { BccApiError, type ValidatorTeamRole } from "@/lib/api/types";
import { formatWaitDuration } from "@/lib/format";

/** 409 `bcc_conflict` copy, keyed on `data.reason`. */
export const TEAM_CONFLICT_COPY: Readonly<Record<string, string>> = {
  invite_not_possible: "This person can't be invited right now.",
  invite_expired: "This invite has expired.",
  role_not_allowed: "You can't do that for this role.",
  already_member: "They're already on this team.",
  invite_pending: "They already have a pending invite.",
  is_owner: "That's the page owner.",
  not_pending: "That invite isn't pending any more.",
  revert_stale: "This was changed again since, so it can't be undone here.",
  not_revertable: "This can no longer be undone.",
};

export const TEAM_ERROR_COPY = {
  credentialInvalid: "That password isn't right.",
  forbidden: "You don't have access to this team.",
  notFound: "This page or team wasn't found.",
  notOnServer: "This isn't available on the server yet.",
  unavailable: "The server couldn't finish this just now, and nothing was changed. Try again.",
  rateLimited: "Too many attempts. Wait a moment and try again.",
  signIn: "Your session has ended. Sign in again, then try again.",
  conflict: "This team changed while you were working. The latest details are shown.",
  rejected: "The server didn't accept this. Check it and try again.",
  generic: "Couldn't finish this. Try again.",
  passwordRequired: "Enter your current password.",
} as const;

export const ROLE_LABEL: Readonly<Record<ValidatorTeamRole, string>> = {
  administrator: "Administrator",
  representative: "Representative",
};

/** The role's label; a role this build doesn't know renders raw. */
export function roleLabel(role: string): string {
  return (ROLE_LABEL as Readonly<Record<string, string>>)[role] ?? role;
}

/** A 403 `bcc_forbidden` with `data.reason: "credential_invalid"`: the password was wrong. */
export function isCredentialInvalid(err: unknown): boolean {
  return forbiddenReason(err) === "credential_invalid";
}

function isRateLimited(err: unknown): boolean {
  return isCode(err, "bcc_rate_limited") || (err instanceof BccApiError && err.status === 429);
}

/**
 * The wait on a rate-limited invite, in seconds: the team contract's
 * `data.retry_after`, else the platform's `data.retry_after_seconds`.
 */
export function inviteRetryAfterSeconds(err: unknown): number | null {
  if (err instanceof BccApiError) {
    const hinted = err.data?.["retry_after"];
    if (typeof hinted === "number" && Number.isFinite(hinted) && hinted > 0) return hinted;
  }
  return retryAfterSeconds(err);
}

/** The per-page invite limit, with the wait when the server sent one. */
export function inviteRateLimitCopy(seconds: number | null): string {
  const head = "Too many invites for this page right now.";
  if (seconds === null) return `${head} Try again later.`;
  if (seconds < 60) {
    const s = Math.ceil(seconds);
    return `${head} Try again in ${s} ${s === 1 ? "second" : "seconds"}.`;
  }
  return `${head} Try again in ${formatWaitDuration(seconds)}.`;
}

/**
 * The line a failed team write shows. `invite` picks the per-page invite
 * limit's copy for a 429.
 */
export function teamWriteErrorCopy(err: unknown, opts: { invite?: boolean } = {}): string {
  if (isCredentialInvalid(err)) return TEAM_ERROR_COPY.credentialInvalid;
  if (isAdminToolUnavailable(err)) return TEAM_ERROR_COPY.notOnServer;
  if (isCode(err, "bcc_conflict")) {
    const reason = conflictReason(err);
    return (reason !== null ? TEAM_CONFLICT_COPY[reason] : undefined) ?? TEAM_ERROR_COPY.conflict;
  }
  if (isAdminDenial(err)) return TEAM_ERROR_COPY.forbidden;
  if (isCode(err, "bcc_not_found")) return TEAM_ERROR_COPY.notFound;
  if (isRateLimited(err)) {
    return opts.invite === true
      ? inviteRateLimitCopy(inviteRetryAfterSeconds(err))
      : TEAM_ERROR_COPY.rateLimited;
  }
  if (isServiceUnavailable(err)) return TEAM_ERROR_COPY.unavailable;
  if (err instanceof BccApiError && err.status === 401) return TEAM_ERROR_COPY.signIn;
  if (isCode(err, "bcc_invalid_request")) return TEAM_ERROR_COPY.rejected;
  return TEAM_ERROR_COPY.generic;
}
