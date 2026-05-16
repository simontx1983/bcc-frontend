/**
 * Trust-layer load-bearing editorial copy.
 *
 * The strings in this module are CANONICAL per `docs/trust-attestation-layer.md` §J.7
 * and `docs/trust-attestation-phase-1-plan.md` §8.2. Multiple surfaces render
 * them: onboarding Card 3, /me/reliability self-mirror, and any future surface
 * that needs the same teaching. The point of lifting them here is **drift
 * prevention** — the verbatim "Absence of attestation is not a negative signal"
 * paragraph is the primary critical-risk-mitigation against the "no vouch = bad"
 * interpretation failure mode (risk assessment §2.9). If two surfaces drift,
 * one of them stops doing the mitigation.
 *
 * Editorial rule per the constitution: **softening, rephrasing, or breaking
 * up the absence-not-negative sentence reopens the failure mode**. Treat these
 * strings the same way you'd treat a contract — change the doc first, then
 * change the constant, then the surfaces re-render.
 *
 * Note on vocabulary — the canonical wording uses direct address ("you're
 * not expected to judge on a schedule") rather than the older mechanistic
 * Layer-2 voice ("the graph doesn't expect you to..."). Direct address
 * lands the reassurance more cleanly without sacrificing the mitigation.
 * The codebase uses "the floor" as the user-facing vernacular elsewhere;
 * this paragraph stays in a plainer register because it's the abstract
 * framing of how the mechanism works.
 */

/**
 * The §2.9 "Absence of attestation is not a negative signal" paragraph,
 * split into a bolded headline + body so each consumer can render the
 * prefix with its own emphasis treatment (italic block, semibold span,
 * larger size, etc.) without parsing a single string back apart.
 *
 * Use both `headline` AND `body` together — they're one paragraph in
 * the doc and the failure mode mitigation only works when the headline
 * frames the body. Don't render `body` alone.
 */
export const ABSENCE_NOT_NEGATIVE = {
  headline: "Absence of attestation is not a negative signal.",
  body:
    "Most operators remain silent most of the time — that’s expected. " +
    "You’re not expected to judge on a schedule or participate constantly. " +
    "Attest only when you have genuine judgment to offer.",
} as const;

/**
 * The "reputation vs reliability" framing — the three short sentences
 * that anchor what the two axes mean and how they evolve. Card 3 of the
 * onboarding flow renders all three; the /me/reliability page renders
 * the same three above its own self-mirror-specific extensions.
 *
 * The bolded terms in each line are part of the load-bearing teaching:
 * the distinction between *reputation* (what others say) and *reliability*
 * (your own track record as judge) is the load-bearing concept. Don't
 * collapse the two sentences into one.
 */
export const REPUTATION_VS_RELIABILITY = {
  reputation_grows: "Your reputation grows from what others say about you.",
  reliability_definition:
    "Your reliability grows from your own track record of judging others accurately over time.",
  both_grow_slowly: "Both grow slowly. Both are durable.",
} as const;
