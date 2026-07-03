/**
 * Legal document configuration — the single place to fill in the
 * operator-specific facts before these pages go live.
 *
 * ⚠️ REVIEW REQUIRED: the Terms / Privacy / Cookie pages that consume
 * these values are a STARTING TEMPLATE drafted to match what the platform
 * actually does. They are NOT legal advice and have not been reviewed by
 * counsel. Have a lawyer review them — especially the liability, dispute-
 * resolution, crypto-risk, and data-protection sections — before you rely
 * on them.
 *
 * The bracketed values below render literally on the page, so anything
 * left unfilled is glaringly visible (and easy to grep: `[`).
 */

export const LEGAL = {
  /** Trading / product name (public brand). */
  brand: "Blue Collar Crypto",

  /** Registered legal entity that operates the service. */
  entity: "Blue Collar Labs LLC]",

  /** Governing law + venue for disputes. Materially affects enforceability. */
  jurisdiction: "Texas, USA",

  /** Physical/mailing address of the operator. */
  address: "506 Ranch Road Granbury TX 76049",

  /** General legal / notices contact. */
  legalEmail: "phillip@bluecollarcrypto.io",

  /** Privacy / data-protection contact (data subject requests). */
  privacyEmail: "privacy@bluecollarcrypto.io",

  /** Effective + last-updated date shown on every document. */
  effectiveDate: "1 July 2026",

  /** Public site origin, used in copy. */
  siteUrl: "https://bluecollarcrypto.io",
} as const;

export const LEGAL_ROUTES = {
  terms: "/terms",
  privacy: "/privacy",
  cookies: "/cookies",
} as const;
