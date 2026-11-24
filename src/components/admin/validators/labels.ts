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
  ValidatorEvidenceType,
  ValidatorOwnerVerification,
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

/** Fallback only: the server's `verification.label` wins (see verificationLabel). */
export const METHOD_LABEL: Readonly<Record<ValidatorOwnerVerificationMethod, string>> = {
  wallet: "Wallet proof",
  siws: "Wallet proof",
  solana_identity: "Node key proof",
  staff: "Staff verification",
};

/** What a staff link was made on: the link form's options and the owner's `evidence_type`. */
export const EVIDENCE_TYPE_LABEL: Readonly<Record<ValidatorEvidenceType, string>> = {
  website: "Website",
  keybase: "Keybase",
  manual: "Manual review",
};

/** The link form's evidence-type options, in display order. */
export const EVIDENCE_TYPE_ORDER: ReadonlyArray<ValidatorEvidenceType> = [
  "website",
  "keybase",
  "manual",
];

/** A history snapshot's `method` may be either a verification method or an evidence type. */
export const SNAPSHOT_METHOD_LABEL: Readonly<
  Record<ValidatorOwnerVerificationMethod | ValidatorEvidenceType, string>
> = { ...METHOD_LABEL, ...EVIDENCE_TYPE_LABEL };

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

/**
 * The server's own `label` for a verification; METHOD_LABEL only when it
 * sent none, and the raw method after that.
 */
export function verificationLabel(verification: ValidatorOwnerVerification): string {
  const fromServer: unknown = verification.label;
  if (typeof fromServer === "string" && fromServer.trim() !== "") return fromServer;
  return labelFor(METHOD_LABEL, verification.method);
}
