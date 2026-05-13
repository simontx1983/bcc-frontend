"use client";

/**
 * ConversationList — paginated inbox rows linking to /messages/[id].
 *
 * Each row renders an avatar + peer/group title + last-message
 * preview + relative timestamp + unread badge. Rows are memoized so
 * a re-render of the inbox shell (e.g., a polled unread-count
 * refetch) doesn't flatten the per-row tree.
 */

import { memo } from "react";
import type { Route } from "next";
import Link from "next/link";

import { Avatar } from "@/components/identity/Avatar";
import type { ConversationSummary } from "@/lib/api/types";

interface ConversationListProps {
  items: ConversationSummary[];
}

export function ConversationList({ items }: ConversationListProps) {
  return (
    <ul className="flex flex-col divide-y divide-cardstock-edge/30 border-y border-cardstock-edge/30">
      {items.map((conv) => (
        <ConversationRow key={conv.id} conv={conv} />
      ))}
    </ul>
  );
}

const ConversationRow = memo(function ConversationRow({
  conv,
}: {
  conv: ConversationSummary;
}) {
  const title = resolveTitle(conv);
  const avatarUrl = conv.peer?.avatar_url ?? "";
  // Avatar wants handle + displayName for the initials fallback. For
  // 1-on-1 convos we have `peer`; for group convos we fall back to the
  // resolved title (the deriveInitials helper handles "Group A, Group B"
  // -> "GA" via whitespace+hyphen split).
  const avatarHandle = conv.peer?.handle ?? title;
  const avatarDisplay = conv.peer?.display_name ?? title;
  const hasUnread = conv.unread_count > 0;

  return (
    <li>
      <Link
        href={`/messages/${conv.id}` as Route}
        className={
          "flex items-center gap-3 px-3 py-3 transition " +
          (hasUnread
            ? "bg-cardstock-deep/20 hover:bg-cardstock-deep/40"
            : "hover:bg-cardstock-deep/30")
        }
      >
        <Avatar
          avatarUrl={avatarUrl}
          handle={avatarHandle}
          displayName={avatarDisplay}
          size="md"
          variant="rounded"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p
              className={
                "truncate text-sm " +
                (hasUnread
                  ? "font-semibold text-cardstock"
                  : "text-cardstock-deep")
              }
            >
              {title}
            </p>
            <span
              className="bcc-mono shrink-0 text-[10px] tracking-[0.16em] text-cardstock-deep/70"
              suppressHydrationWarning
            >
              {formatRelative(conv.last_activity)}
            </span>
          </div>
          <p
            className={
              "truncate text-[13px] leading-snug " +
              (hasUnread
                ? "text-cardstock-deep"
                : "text-cardstock-deep/60")
            }
          >
            {previewLine(conv)}
          </p>
        </div>

        {hasUnread && (
          <span
            aria-label={`${conv.unread_count} unread`}
            className="bcc-mono inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-safety px-1.5 text-[10px] font-semibold leading-none text-cardstock"
          >
            {conv.unread_count}
          </span>
        )}
      </Link>
    </li>
  );
});

function resolveTitle(conv: ConversationSummary): string {
  if (!conv.is_group && conv.peer !== null) {
    return conv.peer.display_name !== ""
      ? conv.peer.display_name
      : conv.peer.handle;
  }
  // Group convo or unresolvable peer — list participant handles.
  const handles = conv.participants
    .map((p) => p.display_name !== "" ? p.display_name : p.handle)
    .filter((s) => s !== "");
  if (handles.length === 0) return "Conversation";
  return handles.join(", ");
}

function previewLine(conv: ConversationSummary): string {
  const author = conv.last_message.author;
  const preview = conv.last_message.preview !== ""
    ? conv.last_message.preview
    : "(no message content)";
  if (author === null) return preview;
  // For 1-on-1, prefix with "You: " when the viewer authored the
  // last message. The peer's preview reads cleaner without their
  // name prefixed (the title already names them).
  // This is a UI convenience only; the server doesn't tell us "you
  // sent this." We infer it: in a 1-on-1 the peer is `conv.peer`,
  // so any other author MUST be the viewer.
  if (!conv.is_group && conv.peer !== null && author.id !== conv.peer.id) {
    return `You: ${preview}`;
  }
  if (conv.is_group) {
    const name = author.display_name !== "" ? author.display_name : author.handle;
    return `${name}: ${preview}`;
  }
  return preview;
}

/**
 * Coarse "X mins ago" relative formatter — mirrors PeepSo's inbox
 * idiom. Falls back to a YYYY-MM-DD stamp for items >7 days old so
 * scanning a long backlog stays readable.
 */
function formatRelative(iso: string): string {
  if (iso === "") return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const now = Date.now();
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d`;
  return iso.slice(0, 10);
}
