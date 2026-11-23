/**
 * Typed wrappers for the validator admin V1 read endpoints: the Validator
 * Directory, the global relationship history and the audit-log health
 * check.
 *
 * Every route is capability-gated server-side (`manage_options`). These
 * wrappers don't pre-validate — the server is the authority, and a 403
 * renders the "Admin access required" panel.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  AdminValidatorDirectoryResponse,
  AdminValidatorPageState,
  ValidatorRelationshipHealth,
  ValidatorRelationshipHistoryResponse,
} from "@/lib/api/types";

export interface AdminValidatorDirectoryParams {
  /** Chain slug from the response's `chains` facet. */
  chain?: string;
  state?: AdminValidatorPageState;
  /** Free-text search. Empty string is the "no filter" sentinel. */
  q?: string;
  cursor?: string;
  /** Server default 25, max 100. */
  limit?: number;
}

export function getAdminValidatorDirectory(
  params: AdminValidatorDirectoryParams = {},
  signal?: AbortSignal,
): Promise<AdminValidatorDirectoryResponse> {
  const search = new URLSearchParams();
  if (params.chain !== undefined && params.chain !== "") {
    search.set("chain", params.chain);
  }
  if (params.state !== undefined) {
    search.set("state", params.state);
  }
  if (params.q !== undefined && params.q !== "") {
    search.set("q", params.q);
  }
  if (params.cursor !== undefined && params.cursor !== "") {
    search.set("cursor", params.cursor);
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  const qs = search.toString();
  const path = `admin/validator-pages${qs !== "" ? `?${qs}` : ""}`;
  return bccFetchAsClient<AdminValidatorDirectoryResponse>(path, { method: "GET", signal });
}

export interface ValidatorRelationshipHistoryParams {
  pageId?: number;
  userId?: number;
  cursor?: string;
  limit?: number;
}

/** Global history across every validator page, newest first. */
export function getValidatorRelationshipHistory(
  params: ValidatorRelationshipHistoryParams = {},
  signal?: AbortSignal,
): Promise<ValidatorRelationshipHistoryResponse> {
  const search = new URLSearchParams();
  if (params.pageId !== undefined) {
    search.set("page_id", String(params.pageId));
  }
  if (params.userId !== undefined) {
    search.set("user_id", String(params.userId));
  }
  if (params.cursor !== undefined && params.cursor !== "") {
    search.set("cursor", params.cursor);
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  const qs = search.toString();
  const path = `admin/validator-relationships/history${qs !== "" ? `?${qs}` : ""}`;
  return bccFetchAsClient<ValidatorRelationshipHistoryResponse>(path, { method: "GET", signal });
}

export function getValidatorRelationshipHealth(
  signal?: AbortSignal,
): Promise<ValidatorRelationshipHealth> {
  return bccFetchAsClient<ValidatorRelationshipHealth>(
    "admin/validator-relationships/health",
    { method: "GET", signal },
  );
}
