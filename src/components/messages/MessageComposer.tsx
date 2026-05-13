"use client";

/**
 * MessageComposer — textarea + Send for the §4.19 thread surface.
 *
 * Mirrors the Composer.tsx pattern (textarea + character-counter live
 * region anchored via aria-describedby). Empty body disables submit.
 * `Enter` (without Shift) submits; `Shift+Enter` inserts a newline so
 * paragraphs work like every chat surface.
 */

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { useReplyInConversationMutation } from "@/hooks/useReplyInConversation";
import { humanizeCode } from "@/lib/api/errors";
import { MESSAGE_BODY_MAX_LENGTH } from "@/lib/api/types";

interface MessageComposerProps {
  conversationId: number;
}

export function MessageComposer({ conversationId }: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useReplyInConversationMutation({
    onSuccess: () => {
      setBody("");
      setError(null);
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
            bcc_blocked: "You can't reply to this conversation.",
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
      <label className="bcc-mono flex flex-col gap-1 text-[11px] tracking-[0.16em] text-cardstock-deep">
        <span className="sr-only">Message</span>
        <textarea
          id="message-composer-body"
          aria-describedby="message-composer-counter"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MESSAGE_BODY_MAX_LENGTH}
          rows={3}
          disabled={mutation.isPending}
          placeholder="Write a message…"
          className="font-serif resize-y rounded-sm border border-cardstock-edge/40 bg-cardstock-deep/30 px-3 py-2 text-[14px] leading-snug text-cardstock placeholder:text-cardstock-deep/60 focus-visible:border-cardstock focus-visible:outline-none disabled:opacity-50"
        />
        <span
          id="message-composer-counter"
          aria-live="polite"
          hidden={body.length < MESSAGE_BODY_MAX_LENGTH - 200}
          className={
            body.length > MESSAGE_BODY_MAX_LENGTH
              ? "text-safety"
              : "text-cardstock-deep/60"
          }
        >
          {body.length}/{MESSAGE_BODY_MAX_LENGTH}
        </span>
      </label>

      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="bcc-mono text-[10px] tracking-[0.16em] text-cardstock-deep/50">
          ENTER TO SEND · SHIFT + ENTER FOR NEWLINE
        </span>
        <button
          type="submit"
          disabled={!canSend}
          className="bcc-mono inline-flex items-center gap-2 border-2 border-cardstock-edge px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock transition hover:bg-cardstock hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-cardstock"
        >
          {mutation.isPending ? "SENDING…" : "SEND"}
        </button>
      </div>
    </form>
  );
}
