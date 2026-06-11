"use client";

/**
 * ConversationsPanel — the header messages-modal inbox preview.
 *
 * Sibling to NotificationsPanel (§11 reuse of its integration shape):
 * SiteHeader's MessagesModal supplies the modal chrome (title +
 * "See all" link + dismiss behavior); this panel owns:
 *   - the inbox query (useConversations — only fetches while `open`),
 *   - loading / error / empty states,
 *   - the genuine "Quiet Inbox" empty state (copy moved verbatim from
 *     the old hardcoded MessagesModal stub — it used to render
 *     unconditionally and lie about non-empty inboxes),
 *   - closing the host surface when a row navigates (`onNavigate`).
 *
 * The modal is a PREVIEW: first page only, no pagination chrome —
 * "See all" in the modal head goes to /messages, which owns the full
 * Prev/Next inbox (src/app/(main)/messages/page.tsx). Rows come from
 * ConversationList as-is so the preview and the full inbox can never
 * drift apart.
 */

import { ConversationList } from "@/components/messages/ConversationList";
import { useConversations } from "@/hooks/useConversations";
import { humanizeCode } from "@/lib/api/errors";

interface ConversationsPanelProps {
  /** False for anon — the query short-circuits without firing. */
  enabled: boolean;
  /** The list only fetches while the host surface is open. */
  open: boolean;
  /** Called when a conversation row navigates so the host can close. */
  onNavigate: () => void;
}

export function ConversationsPanel({ enabled, open, onNavigate }: ConversationsPanelProps) {
  // page 1 + default perPage matches the /messages call site's first
  // page exactly, so the modal and the inbox page share one cache
  // entry (queryKey ["conversations", 1, 20]).
  const query = useConversations({ page: 1, enabled: enabled && open });

  if (query.isError) {
    return (
      <div className="bcc-mono bg-cardstock px-4 py-3 text-[11px] text-ink-soft">
        {humanizeCode(
          query.error,
          {
            bcc_unauthorized: "Sign in to read your messages.",
          },
          "Couldn’t load your inbox. Try again in a moment.",
        )}
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="bcc-mono bg-cardstock px-4 py-3 text-[11px] text-ink-soft">
        Loading…
      </div>
    );
  }

  const items = query.data.items;

  if (items.length === 0) {
    // The old MessagesModal stub's copy, now rendered only when the
    // inbox is ACTUALLY empty. Inline styles kept verbatim so the
    // visual is unchanged.
    return (
      <div style={{ padding: "32px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }} aria-hidden>📭</div>
        <p style={{ fontFamily: "var(--font-stencil), Impact, sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bcc-text)", marginBottom: 8 }}>
          Quiet Inbox
        </p>
        <p style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 13, color: "var(--bcc-text-secondary)", lineHeight: 1.6 }}>
          No conversations yet. Start one from the directory — every operator has a file, every file has a Message button.
        </p>
      </div>
    );
  }

  return (
    <div
      className="max-h-[60vh] overflow-y-auto"
      // ConversationList rows are plain <Link>s (reused as-is, per
      // §11 — no onNavigate fork). Catch the bubbled click from any
      // row anchor so the host modal closes while Link navigation
      // proceeds. Clicks on non-anchor whitespace don't close.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a") !== null) {
          onNavigate();
        }
      }}
    >
      <ConversationList items={items} />
    </div>
  );
}
