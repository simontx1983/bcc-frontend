/**
 * Error predicates shared by the `/admin/*` screens (moderation queue,
 * validator directory, validator audit history).
 *
 * The admin routes are gated by `manage_options` on the server; the
 * frontend has no role gate of its own. These predicates decide which
 * purpose-built panel a failed read renders instead of a Retry.
 */

import { BccApiError } from "@/lib/api/types";

/**
 * Two codes, one meaning: the endpoint's in-handler adminGate() emits
 * bcc_forbidden, but the REST permission_callback rejects first with
 * WP-core's rest_forbidden — which is what non-admins actually receive.
 * Branching on only bcc_forbidden made the admin-required panel
 * unreachable (non-admins got the generic retry copy, which invites
 * retrying something that can never succeed).
 */
export function isAdminDenial(err: unknown): boolean {
  return err instanceof BccApiError && (err.code === "bcc_forbidden" || err.code === "rest_forbidden");
}

/**
 * The admin route is not on this server yet: WP-core answers an
 * unregistered route with `rest_no_route` (enveloped by bcc-trust's
 * Envelope, still 404). Only that code means "not deployed": staff see
 * "not available yet" rather than a Retry that cannot help.
 */
export function isAdminToolUnavailable(err: unknown): boolean {
  return err instanceof BccApiError && err.code === "rest_no_route";
}

/**
 * The route exists but an id it was given matches nothing: an unknown
 * page_id or user_id filter answers `bcc_not_found` (the normal BCC 404).
 * Retrying can't help, and it must not read as "not deployed".
 */
export function isAdminIdNotFound(err: unknown): boolean {
  return err instanceof BccApiError && err.code === "bcc_not_found";
}

/**
 * `data.<key>` of a BccApiError carrying `code`, when it is a string;
 * otherwise null. The validator admin writes key their copy on
 * `data.reason` (409, step-up) and `data.field` (422).
 */
function dataString(err: unknown, code: string, key: string): string | null {
  if (!(err instanceof BccApiError) || err.code !== code) return null;
  const value = err.data?.[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/** A 409 `bcc_conflict`: the page changed under the admin. */
export function isOwnershipConflict(err: unknown): boolean {
  return err instanceof BccApiError && err.code === "bcc_conflict";
}

/** The write committed; only its result projection failed. Never offer a blind retry. */
export function isCommittedValidatorResult(err: unknown): boolean {
  return dataString(err, "bcc_unavailable", "reason") === "result_unavailable"
    && err instanceof BccApiError && err.data?.["committed"] === true;
}

/** The 409's `data.reason` (`wallet_owner_present`, `owner_exists`, …), or null. */
export function conflictReason(err: unknown): string | null {
  return dataString(err, "bcc_conflict", "reason");
}

/** A `bcc_step_up_failed`'s `data.reason` (`password`, `code`, `expired`, `used`, `mismatch`), or null. */
export function stepUpFailureReason(err: unknown): string | null {
  return dataString(err, "bcc_step_up_failed", "reason");
}

/** A 422 `bcc_invalid_request`'s `data.reason` (e.g. `target_not_eligible`), or null. */
export function invalidReason(err: unknown): string | null {
  return dataString(err, "bcc_invalid_request", "reason");
}

/** The field a 422 `bcc_invalid_request` names in `data.field`, or null. */
export function invalidField(err: unknown): string | null {
  return dataString(err, "bcc_invalid_request", "field");
}
