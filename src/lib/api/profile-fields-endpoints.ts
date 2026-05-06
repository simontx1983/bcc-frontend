/**
 * §V2 Phase 2.5 — typed wrappers for /me/profile/fields.
 *
 * Backend: MyProfileFieldsEndpoint @ /wp-json/bcc/v1. Standard BCC
 * envelope. Auth required.
 *
 * Three operations:
 *   - getProfileFields            → GET   /me/profile/fields
 *   - patchProfileFieldValue      → PATCH /me/profile/fields/{key}
 *   - patchProfileFieldVisibility → PATCH /me/profile/fields/{key}/visibility
 *
 * The field catalogue is admin-configured in PeepSo's wp-admin UI. We
 * never invent fields here — we render whatever the catalogue returns.
 */

import { bccFetchAsClient } from "@/lib/api/client";

export type ProfileFieldVisibility = "public" | "members" | "private";

export type ProfileFieldType =
  | "text"
  | "textarea"
  | "date"
  | "url"
  | "email"
  | "select_single"
  | "select_multi"
  | "select_bool"
  | "country"
  | "location";

export interface ProfileFieldOption {
  value: string;
  label: string;
}

export interface ProfileField {
  key: string;
  label: string;
  help_text: string | null;
  type: ProfileFieldType;
  /** String for scalar types; string[] for select_multi. */
  value: string | string[];
  visibility: ProfileFieldVisibility;
  visibility_locked: boolean;
  editable: boolean;
  required: boolean;
  max_length: number | null;
  options: ProfileFieldOption[] | null;
  order: number;
}

export interface ProfileFieldsStats {
  filled: number;
  total: number;
  completeness: number;
}

export interface ProfileFieldsResponse {
  fields: ProfileField[];
  stats: ProfileFieldsStats;
}

export function getProfileFields(
  signal?: AbortSignal,
): Promise<ProfileFieldsResponse> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<ProfileFieldsResponse>("me/profile/fields", init);
}

export function patchProfileFieldValue(
  key: string,
  value: string | string[],
): Promise<ProfileField> {
  return bccFetchAsClient<ProfileField>(
    `me/profile/fields/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      body: { value },
    },
  );
}

export function patchProfileFieldVisibility(
  key: string,
  visibility: ProfileFieldVisibility,
): Promise<ProfileField> {
  return bccFetchAsClient<ProfileField>(
    `me/profile/fields/${encodeURIComponent(key)}/visibility`,
    {
      method: "PATCH",
      body: { visibility },
    },
  );
}
