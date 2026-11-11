/**
 * Validator messaging + unclaimed-page action decisions, shared by the
 * entity-profile CTA (MessageValidatorButton) and the trading card's
 * action row (CardActionBar). Pure: no React, no state, no fetch — each
 * surface renders the returned decision in its own visual register.
 *
 * Every input is server-owned. The decision branches on
 * `messaging.destination` and `permissions.can_message` ONLY, never on
 * `is_claimed` (which cannot tell a never-claimed page from a
 * previously-claimed one).
 *
 * §N7 visibility rule, as applied to `can_message` reason codes:
 *
 *   auth_required        → disabled ("Sign in to send a message.")
 *   sender_chat_disabled → disabled + the SERVER's unlock_hint
 *   anything else / null → hidden (structural deny, incl. F-99
 *                          `unavailable`, `self_action_blocked`,
 *                          `messaging_unavailable`, `not_applicable`,
 *                          and the legacy `friends_only`, which the
 *                          server no longer emits since peepso-friends
 *                          was removed)
 */

import type { CardKind, CardMessaging } from "@/lib/api/types";
import { isAllowed, reasonCode, unlockHint } from "@/lib/permissions";

/** Copy owned by the frontend — the server sends no hint for anon viewers. */
export const MESSAGE_AUTH_REQUIRED_HINT = "Sign in to send a message.";

export type ValidatorMessageAction =
  /** No affordance at all on this surface. */
  | { kind: "hidden" }
  /** The collapsed info-leak shield: one generic line, no action. */
  | { kind: "unavailable" }
  /** Visible-but-disabled, with the copy explaining what unlocks it. */
  | { kind: "disabled"; label: string; hint: string }
  /** Navigable link to the pinned composer. */
  | { kind: "link"; label: string; href: string };

export function resolveValidatorMessageAction({
  pageId,
  permissions,
  messaging,
}: {
  pageId: number;
  permissions: unknown;
  messaging: CardMessaging | undefined;
}): ValidatorMessageAction {
  const destination = messaging?.destination ?? "none";

  if (destination === "none") {
    return { kind: "hidden" };
  }
  if (destination === "unavailable") {
    return { kind: "unavailable" };
  }

  // destination is "queue" | "operator" from here down. The label names
  // the real recipient so the viewer knows who reads it before they
  // write — the queue variant is honest that nobody has claimed it yet.
  const label = destination === "operator" ? "Message Operator" : "Message Validator";

  if (!isAllowed(permissions, "can_message")) {
    const hint = disabledHintFor(
      reasonCode(permissions, "can_message"),
      unlockHint(permissions, "can_message"),
    );
    return hint === null ? { kind: "hidden" } : { kind: "disabled", label, hint };
  }

  return {
    kind: "link",
    label,
    href: `/messages/new?to_page=${pageId}&to_kind=validator`,
  };
}

/**
 * Resolve the copy for a denied gate, or null when the action should be
 * hidden outright. `auth_required` is the one case whose copy the
 * frontend owns; every other visible-disabled reason renders the
 * SERVER's `unlock_hint` verbatim.
 */
function disabledHintFor(code: string | null, serverHint: string | null): string | null {
  if (code === "auth_required") {
    return MESSAGE_AUTH_REQUIRED_HINT;
  }
  if (code === "sender_chat_disabled") {
    return serverHint;
  }
  return null;
}

/**
 * True when a validator page has never been claimed, read from the
 * server's `messaging.destination === "queue"` signal (NOT `is_claimed`).
 *
 * There is no real operator behind such a page, so Vouch, Back and
 * Report are not rendered for it on any surface — the attestation write
 * would 404 against an unclaimed target anyway. Watch and Message stay.
 * Kept permanently: harmless once the backend denies those gates too.
 */
export function isNeverClaimedValidator(card: {
  card_kind: CardKind;
  messaging?: CardMessaging | undefined;
}): boolean {
  return card.card_kind === "validator" && card.messaging?.destination === "queue";
}
