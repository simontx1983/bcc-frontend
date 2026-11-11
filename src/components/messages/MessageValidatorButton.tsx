/**
 * MessageValidatorButton — the "reach this validator" CTA on the
 * validator entity profile.
 *
 * Every decision here belongs to the server. The component branches on
 * two server-owned inputs and derives nothing:
 *
 *   1. `messaging.destination` — WHERE a message would go. The client
 *      MUST NOT infer this from `is_claimed`: that flag cannot tell a
 *      never-claimed page from a previously-claimed one, so any
 *      client-side claim-lifecycle inference is wrong by construction.
 *
 *   2. `permissions.can_message` — WHETHER this viewer may send. Read
 *      through the defensive helpers in `lib/permissions`, so a backend
 *      that hasn't shipped the gate yet (absent key) degrades to
 *      "hidden" rather than crashing or, worse, defaulting to allowed.
 *
 * The decision itself lives in `lib/validators/messaging`
 * (`resolveValidatorMessageAction`), shared with the trading card's
 * Message pill so the two surfaces can never drift; this file only
 * renders it.
 *
 * §N7 visibility rule, as applied to the reason codes:
 *
 *   auth_required        → visible-disabled ("Sign in to send a message.")
 *   sender_chat_disabled → visible-disabled + the SERVER's unlock_hint
 *   not_applicable       → hidden
 *   self_action_blocked  → hidden (the viewer IS the operator)
 *   messaging_unavailable→ hidden
 *   unavailable          → hidden (F-99: blocks couldn't be checked)
 *   anything else / null → hidden (structural deny, per §N7; includes
 *                          the legacy `friends_only`, no longer emitted
 *                          since peepso-friends was removed)
 *
 * `messaging_unavailable` and the `unavailable` destination are
 * INFO-LEAK SHIELDS: the server returns a byte-identical payload for
 * "recipient turned DMs off" and "the two of you are mutually blocked."
 * Rendering anything that distinguishes them — different copy, a
 * different icon, an operator name, a retry affordance — would reopen
 * the leak. One generic line, no identities, no action.
 *
 * No animation: nothing here moves, so `prefers-reduced-motion` is
 * satisfied trivially rather than by a motion-safe fallback.
 *
 * Intentionally NOT marked "use client": the component holds no state,
 * runs no effects, and touches no browser API. Without the directive it
 * renders inside the server tree (EntityProfile) at zero bundle cost and
 * still composes into a client tree if a card surface ever needs it.
 */

import type { Route } from "next";
import Link from "next/link";

import type { CardMessaging, CardPermissions } from "@/lib/api/types";
import { resolveValidatorMessageAction } from "@/lib/validators/messaging";

/** Generic, identity-free line for the collapsed `unavailable` state. */
const UNAVAILABLE_LINE = "Messaging temporarily unavailable";

const BUTTON_BASE_CLASS =
  "bcc-mono mt-4 inline-flex w-fit items-center gap-2 border-2 px-3 py-1.5 " +
  "text-[11px] tracking-[0.18em] transition";

const BUTTON_ENABLED_CLASS =
  "border-cardstock-edge text-cardstock hover:bg-cardstock hover:text-ink";

const BUTTON_DISABLED_CLASS =
  "cursor-not-allowed border-cardstock-edge/40 text-cardstock-deep/60";

export interface MessageValidatorButtonProps {
  /** Page id of the validator — the `page_id` the composer will send. */
  pageId: number;
  /** `card.permissions`. Read defensively; absent gate ⇒ hidden. */
  permissions: CardPermissions;
  /** `card.messaging`. Absent ⇒ treated as `destination: "none"`. */
  messaging: CardMessaging | undefined;
}

export function MessageValidatorButton({
  pageId,
  permissions,
  messaging,
}: MessageValidatorButtonProps) {
  const action = resolveValidatorMessageAction({ pageId, permissions, messaging });

  switch (action.kind) {
    case "hidden":
      return null;

    // Collapsed two-state shield — one line, no identities, no action.
    case "unavailable":
      return (
        <p className="bcc-mono mt-4 text-[11px] tracking-[0.16em] text-cardstock-deep/70">
          {UNAVAILABLE_LINE}
        </p>
      );

    case "disabled":
      return (
        <div className="flex w-fit flex-col gap-1">
          <button
            type="button"
            disabled
            aria-disabled
            title={action.hint}
            className={`${BUTTON_BASE_CLASS} ${BUTTON_DISABLED_CLASS}`}
          >
            {action.label}
          </button>
          <p className="bcc-mono pl-1 text-[10px] leading-snug tracking-[0.14em] text-bcc-text-safety">
            {action.hint}
          </p>
        </div>
      );

    case "link":
      return (
        <Link
          href={action.href as Route}
          className={`${BUTTON_BASE_CLASS} ${BUTTON_ENABLED_CLASS}`}
        >
          {action.label}
        </Link>
      );
  }
}
