/**
 * Display labels for the validator admin server enums.
 *
 * Pure lookups: the server decides every state, method and action, and
 * these tables only name them. Nothing here derives a state from other
 * fields. A value the server adds later falls back to its raw string via
 * `labelFor`, so a new enum member renders rather than crashing.
 */

import type {
  AdminValidatorPageState,
  ValidatorOwnerVerificationMethod,
  ValidatorRelationshipAction,
  ValidatorRelationshipStepUp,
} from "@/lib/api/types";

export const STATE_LABEL: Readonly<Record<AdminValidatorPageState, string>> = {
  unclaimed: "Unclaimed",
  wallet_verified: "Wallet Verified",
  staff_verified: "Verified by BCC",
  conflict: "Conflict",
};

/** Display order for the state filter and the facet counts. */
export const STATE_ORDER: ReadonlyArray<AdminValidatorPageState> = [
  "unclaimed",
  "wallet_verified",
  "staff_verified",
  "conflict",
];

export const METHOD_LABEL: Readonly<Record<ValidatorOwnerVerificationMethod, string>> = {
  wallet: "Wallet proof",
  website: "Website",
  keybase: "Keybase",
  manual: "Manual review",
};

export const ACTION_LABEL: Readonly<Record<ValidatorRelationshipAction, string>> = {
  linked: "Owner linked",
  revoked: "Owner revoked",
  cancelled: "Link cancelled",
  wallet_unlinked: "Wallet unlinked",
  account_deleted: "Account deleted",
  promoted_by_wallet: "Promoted by wallet proof",
  step_up_failed: "Step-up failed",
  step_up_expired: "Step-up expired",
};

export const STEP_UP_LABEL: Readonly<Record<ValidatorRelationshipStepUp, string>> = {
  password: "Password",
  "password+code": "Password + emailed code",
};

/** `table[value]`, or the raw value when the server sent one we don't know. */
export function labelFor<K extends string>(table: Readonly<Record<K, string>>, value: K): string {
  const known: string | undefined = (table as Readonly<Record<string, string>>)[value];
  return known ?? value;
}
