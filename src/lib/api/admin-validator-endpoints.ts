/**
 * Typed wrappers for the validator admin V1 endpoints: the Validator
 * Directory, one page's relationships, the global and per-page history,
 * the audit-log health check, the admin user search, the step-up, and
 * the owner link / revoke / cancel writes.
 *
 * Every route is capability-gated server-side (`manage_options`). These
 * wrappers don't pre-validate — the server is the authority, and a 403
 * renders the "Admin access required" panel.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  AdminUserSearchResponse,
  AdminValidatorDirectoryResponse,
  AdminValidatorPageRelationships,
  AdminValidatorPageState,
  CancelValidatorOwnerLinkRequest,
  CancelValidatorOwnerLinkResponse,
  LinkValidatorOwnerRequest,
  LinkValidatorOwnerResponse,
  RevokeValidatorOwnerRequest,
  RevokeValidatorOwnerResponse,
  ValidatorRelationshipHealth,
  ValidatorRelationshipHistoryResponse,
  ValidatorStepUpResendResponse,
  ValidatorStepUpStartRequest,
  ValidatorStepUpStartResponse,
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

const pagePath = (pageId: number) => `admin/validator-pages/${pageId}`;

/** Route 2: one page, its owner, any conflicting claimants and the revoke reasons. */
export function getAdminValidatorPageRelationships(
  pageId: number,
  signal?: AbortSignal,
): Promise<AdminValidatorPageRelationships> {
  return bccFetchAsClient<AdminValidatorPageRelationships>(`${pagePath(pageId)}/relationships`, {
    method: "GET",
    signal,
  });
}

export interface AdminValidatorPageHistoryParams {
  cursor?: string;
  limit?: number;
}

/** Route 7, per page: one page's history, newest first. */
export function getAdminValidatorPageHistory(
  pageId: number,
  params: AdminValidatorPageHistoryParams = {},
  signal?: AbortSignal,
): Promise<ValidatorRelationshipHistoryResponse> {
  const search = new URLSearchParams();
  if (params.cursor !== undefined && params.cursor !== "") {
    search.set("cursor", params.cursor);
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  const qs = search.toString();
  const path = `${pagePath(pageId)}/history${qs !== "" ? `?${qs}` : ""}`;
  return bccFetchAsClient<ValidatorRelationshipHistoryResponse>(path, { method: "GET", signal });
}

/**
 * Route 8: at most 10 users by handle, display name, or an exact email or
 * login. A POST with `{q}` in the JSON body, never in the URL: the term
 * can be an email or login, and a URL ends up in access logs.
 */
export function searchAdminUsers(q: string, signal?: AbortSignal): Promise<AdminUserSearchResponse> {
  return bccFetchAsClient<AdminUserSearchResponse>("admin/users/search", {
    method: "POST",
    body: { q },
    signal,
  });
}

/** Route 3: check the password and email a code. A wrong password sends no email. */
export function startValidatorStepUp(
  pageId: number,
  body: ValidatorStepUpStartRequest,
): Promise<ValidatorStepUpStartResponse> {
  return bccFetchAsClient<ValidatorStepUpStartResponse>(`${pagePath(pageId)}/step-up`, {
    method: "POST",
    body,
  });
}

/** Route 3: email a fresh code for the same step-up. */
export function resendValidatorStepUp(stepUpId: string): Promise<ValidatorStepUpResendResponse> {
  return bccFetchAsClient<ValidatorStepUpResendResponse>(
    `admin/validator-pages/step-up/${encodeURIComponent(stepUpId)}/resend`,
    { method: "POST" },
  );
}

/** Route 4: link a staff-verified owner. */
export function linkValidatorOwner(
  pageId: number,
  body: LinkValidatorOwnerRequest,
): Promise<LinkValidatorOwnerResponse> {
  return bccFetchAsClient<LinkValidatorOwnerResponse>(`${pagePath(pageId)}/relationships`, {
    method: "POST",
    body,
  });
}

/** Route 5: revoke the owner linked by `linkId`. */
export function revokeValidatorOwner(
  pageId: number,
  linkId: number,
  body: RevokeValidatorOwnerRequest,
): Promise<RevokeValidatorOwnerResponse> {
  return bccFetchAsClient<RevokeValidatorOwnerResponse>(
    `${pagePath(pageId)}/relationships/${linkId}/revoke`,
    { method: "POST", body },
  );
}

/** Route 6: cancel the staff link `linkId`, restoring any previous owner. */
export function cancelValidatorOwnerLink(
  pageId: number,
  linkId: number,
  body: CancelValidatorOwnerLinkRequest,
): Promise<CancelValidatorOwnerLinkResponse> {
  return bccFetchAsClient<CancelValidatorOwnerLinkResponse>(
    `${pagePath(pageId)}/relationships/${linkId}/cancel`,
    { method: "POST", body },
  );
}
