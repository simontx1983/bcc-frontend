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
 * Envelope, still 404), and a deployed handler that has not been wired
 * answers `bcc_not_found`. Used while the validator admin backend rolls
 * out, so staff see "not available yet" rather than a Retry that cannot
 * help.
 */
export function isAdminToolUnavailable(err: unknown): boolean {
  return err instanceof BccApiError && (err.code === "rest_no_route" || err.code === "bcc_not_found");
}
