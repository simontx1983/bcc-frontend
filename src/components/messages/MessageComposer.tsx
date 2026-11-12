"use client";

/**
 * MessageComposer — textarea + Send for the §4.19 thread surface.
 *
 * Mirrors the Composer.tsx pattern (textarea + character-counter live
 * region anchored via aria-describedby). Empty body disables submit.
 * `Enter` (without Shift) submits; `Shift+Enter` inserts a newline so
 * paragraphs work like every chat surface.
 */

import type { Route } from "next";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { counterToneClass } from "@/lib/counter-tone";
import { useReplyInConversationMutation } from "@/hooks/useReplyInConversation";
import { humanizeCode } from "@/lib/api/errors";
import { MESSAGE_BODY_MAX_LENGTH, type CardPermissionEntry } from "@/lib/api/types";
import { resolveDmGate } from "@/lib/validators/messaging";

interface MessageComposerProps {
  conversationId: number;
  /** The thread's `conversation.can_reply` (F-246). Absent = allowed. */
  canReply?: CardPermissionEntry | undefined;
}

/** Where the viewer's own direct-message switch lives. */
const MESSAGE_SETTINGS_HREF = "/u/me?tab=messages" as Route;

export function MessageComposer({ conversationId, canReply }: MessageComposerProps) {
  const gate = resolveDmGate(canReply);
  if (gate.kind !== "allowed") {
    // F-246: say so BEFORE the user writes, instead of failing on send
    // ("This conversation no longer exists" for a block was wrong copy).
    return (
      <div role="status" className="bcc-paper flex flex-col gap-2 p-4">
        <p className="bcc-mono text-[11px] leading-snug text-bcc-text-secondary">
          {gate.kind === "hint" ? gate.hint : "You can't reply in this conversation."}
        </p>
        {gate.kind === "hint" && gate.opensSettings && (
          <Link
            href={MESSAGE_SETTINGS_HREF}
            className="bcc-mono w-fit text-[11px] tracking-[0.12em] text-bcc-text underline underline-offset-2"
          >
            Open message settings
          </Link>
        )}
      </div>
    );
  }
  return <ReplyForm conversationId={conversationId} />;
}

function ReplyForm({ conversationId }: { conversationId: number }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mutation = useReplyInConversationMutation({
    onSuccess: () => {
      captureAnalyticsEvent("message_sent");
      setBody("");
      setError(null);
      // Ready for the next message without a tap: on a phone this keeps
      // the keyboard up; for keyboard and screen-reader users it keeps
      // their place (UX scan H11).
      textareaRef.current?.focus();
    },
    onError: (err) => {
      setError(
        humanizeCode(
          err,
          {
            bcc_unauthorized: "Sign in to send a message.",
            bcc_rate_limited: "Sending too fast — wait a moment and try again.",
            bcc_invalid_request: "Message couldn't be sent. Check the contents.",
            bcc_forbidden: "You can't reply to this conversation.",
            bcc_not_found: "This conversation no longer exists.",
          },
          "Couldn't send your message.",
        ),
      );
    },
  });

  const trimmed = body.trim();
  const canSend = trimmed !== "" && !mutation.isPending && body.length <= MESSAGE_BODY_MAX_LENGTH;

  const submit = () => {
    if (!canSend) return;
    setError(null);
    mutation.mutate({ conversationId, body: trimmed });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="bcc-mono flex flex-col gap-1 text-[11px] tracking-[0.16em] text-bcc-text-secondary">
        <span className="sr-only">Message</span>
        <textarea
          ref={textareaRef}
          id="message-composer-body"
          aria-describedby="message-composer-counter"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MESSAGE_BODY_MAX_LENGTH}
          rows={3}
          // Read-only, not disabled, while sending. Disabling the focused
          // textarea blurred it: the phone keyboard closed after every
          // message and focus fell to <body> (UX scan H11). canSend still
          // blocks a double send.
          readOnly={mutation.isPending}
          aria-busy={mutation.isPending}
          placeholder="Write a message…"
          className="font-serif resize-y rounded-sm border border-bcc-input-border bg-bcc-input-bg px-3 py-2 text-[14px] leading-snug text-bcc-text placeholder:text-bcc-text-placeholder focus-visible:border-bcc-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bcc-accent read-only:opacity-70"
        />
        <span
          id="message-composer-counter"
          aria-live="polite"
          hidden={body.length < MESSAGE_BODY_MAX_LENGTH - 200}
          className={counterToneClass(body.length, MESSAGE_BODY_MAX_LENGTH)}
        >
          {body.length}/{MESSAGE_BODY_MAX_LENGTH}
        </span>
      </label>

      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-bcc-text-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-secondary">
          ENTER TO SEND · SHIFT + ENTER FOR NEWLINE
        </span>
        <button
          type="submit"
          disabled={!canSend}
          className="bcc-mono inline-flex items-center gap-2 border-2 border-bcc-border px-3 py-1.5 text-[10px] tracking-[0.18em] text-bcc-text transition hover:bg-bcc-surface-hover hover:border-bcc-border-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {mutation.isPending ? "SENDING…" : "SEND"}
        </button>
      </div>
    </form>
  );
}
