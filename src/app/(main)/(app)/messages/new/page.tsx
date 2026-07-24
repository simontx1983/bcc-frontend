"use client";

/**
 * /messages/new — start a new 1-on-1 conversation.
 *
 * Two-step UX in one page: pick a recipient (search via the existing
 * /members hook), then write the first message + send. On success the
 * server returns the conversation_id and we navigate to /messages/[id]
 * to land in the thread.
 *
 * Group convos are intentionally not creatable here (per V1 scope —
 * we render existing groups read-only but don't expose the
 * multi-recipient picker). PeepSo's native UI still creates groups
 * the old-fashioned way.
 */

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/identity/Avatar";
import { useMembers } from "@/hooks/useMembers";
import { useStartConversationMutation } from "@/hooks/useStartConversation";
import { humanizeCode } from "@/lib/api/errors";
import {
  MESSAGE_BODY_MAX_LENGTH,
  type Card,
} from "@/lib/api/types";

const SEARCH_DEBOUNCE_MS = 250;
const PER_PAGE = 12;

export default function NewMessagePage() {
  const router = useRouter();
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  const [recipient, setRecipient] = useState<Card | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Debounce the search input → debouncedSearch.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [searchInput]);

  const memberQuery = useMembers({
    page: 1,
    perPage: PER_PAGE,
    q: debouncedSearch,
    enabled: isAuthed && recipient === null && debouncedSearch.length >= 2,
  });

  const mutation = useStartConversationMutation({
    onSuccess: (data) => {
      router.push(`/messages/${data.conversation_id}` as Route);
    },
    onError: (err) => {
      setError(
        humanizeCode(
          err,
          {
            bcc_unauthorized: "Sign in to start a conversation.",
            bcc_rate_limited: "Too many new conversations — wait a moment and try again.",
            bcc_invalid_request: "Couldn't start the conversation. Check the recipient and message.",
            bcc_forbidden: "You can't message this person.",
          },
          "Couldn't start the conversation.",
        ),
      );
    },
  });

  const trimmed = body.trim();
  const canSend = useMemo(
    () =>
      recipient !== null &&
      trimmed !== "" &&
      body.length <= MESSAGE_BODY_MAX_LENGTH &&
      !mutation.isPending,
    [recipient, trimmed, body.length, mutation.isPending],
  );

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || recipient === null) return;
    setError(null);
    mutation.mutate({ recipient_id: recipient.id, body: trimmed });
  };

  return (
    <main className="pb-24">
      <Rail />

      <header className="mx-auto max-w-3xl px-2 sm:px-3 pt-12">
        <Link
          href={"/messages" as Route}
          className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary transition hover:text-bcc-text"
        >
          ← INBOX
        </Link>
        <h1
          className="bcc-stencil mt-3 text-bcc-text leading-[0.95]"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
        >
          New message
        </h1>
      </header>

      <section className="mx-auto mt-10 max-w-3xl px-2 sm:px-3">
        {!isAuthed && session.status !== "loading" && (
          <p className="bcc-mono text-bcc-text-secondary">Sign in to start a conversation.</p>
        )}

        {isAuthed && (
          <form onSubmit={submit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
                TO
              </span>
              {recipient !== null ? (
                <SelectedRecipient
                  recipient={recipient}
                  onClear={() => {
                    setRecipient(null);
                    setSearchInput("");
                    setDebouncedSearch("");
                  }}
                />
              ) : (
                <RecipientPicker
                  searchInput={searchInput}
                  onSearchChange={setSearchInput}
                  query={memberQuery}
                  onSelect={(m) => {
                    setRecipient(m);
                    setSearchInput("");
                  }}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
                MESSAGE
              </span>
              <textarea
                id="new-message-body"
                aria-describedby="new-message-counter"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={MESSAGE_BODY_MAX_LENGTH}
                rows={5}
                disabled={mutation.isPending}
                placeholder="Write your first message…"
                className="font-serif resize-y rounded-sm border border-bcc-input-border bg-bcc-input-bg px-3 py-2 text-[14px] leading-snug text-bcc-text placeholder:text-bcc-text-placeholder focus-visible:border-bcc-accent focus-visible:outline-none disabled:opacity-50"
              />
              <span
                id="new-message-counter"
                aria-live="polite"
                hidden={body.length < MESSAGE_BODY_MAX_LENGTH - 200}
                className={
                  "bcc-mono text-[10px] tracking-[0.16em] " +
                  (body.length > MESSAGE_BODY_MAX_LENGTH
                    ? "text-safety"
                    : "text-bcc-text-muted")
                }
              >
                {body.length}/{MESSAGE_BODY_MAX_LENGTH}
              </span>
            </div>

            {error !== null && (
              <p role="alert" className="bcc-mono text-[11px] text-safety">
                {error}
              </p>
            )}

            <div>
              <button
                type="submit"
                disabled={!canSend}
                className="bcc-mono inline-flex items-center gap-2 border-2 border-bcc-border px-3 py-1.5 text-[10px] tracking-[0.18em] text-bcc-text transition hover:bg-bcc-surface-hover hover:border-bcc-border-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {mutation.isPending ? "SENDING…" : "SEND →"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function Rail() {
  return (
    <div className="border-b border-dashed border-bcc-border">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-bcc-text-secondary">
          <span className="bcc-rail-dot" aria-hidden />
          <span>BCC &nbsp;//&nbsp; MESSAGES</span>
        </span>
        <span className="bcc-mono text-bcc-text-muted">DIRECT &nbsp;//&nbsp; NEW</span>
      </div>
    </div>
  );
}

function SelectedRecipient({
  recipient,
  onClear,
}: {
  recipient: Card;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-bcc-border bg-bcc-surface-hover px-3 py-2">
      <Avatar
        avatarUrl={recipient.crest.image_url}
        handle={recipient.handle}
        displayName={recipient.name}
        size="sm"
        variant="rounded"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-bcc-text">
          {recipient.name !== "" ? recipient.name : recipient.handle}
        </p>
        <p className="bcc-mono truncate text-[10px] tracking-[0.16em] text-bcc-text-muted">
          @{recipient.handle}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-muted transition hover:text-bcc-text"
      >
        CHANGE
      </button>
    </div>
  );
}

function RecipientPicker({
  searchInput,
  onSearchChange,
  query,
  onSelect,
}: {
  searchInput: string;
  onSearchChange: (s: string) => void;
  query: ReturnType<typeof useMembers>;
  onSelect: (member: Card) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={searchInput}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by handle or display name…"
        maxLength={64}
        className="bcc-mono w-full rounded-sm border border-bcc-input-border bg-bcc-input-bg px-3 py-2 text-bcc-text outline-none placeholder:text-bcc-text-placeholder focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent"
      />

      {searchInput.length < 2 && (
        <p className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-muted">
          Type at least 2 characters to search.
        </p>
      )}

      {searchInput.length >= 2 && query.isPending && (
        <p className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-muted">
          Searching…
        </p>
      )}

      {searchInput.length >= 2 && query.isSuccess && query.data.items.length === 0 && (
        <p className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-muted">
          No members match.
        </p>
      )}

      {searchInput.length >= 2 && query.isSuccess && query.data.items.length > 0 && (
        <ul className="flex flex-col divide-y divide-bcc-border rounded-sm border border-bcc-border">
          {query.data.items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelect(m)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-bcc-surface-hover"
              >
                <Avatar
                  avatarUrl={m.crest.image_url}
                  handle={m.handle}
                  displayName={m.name}
                  size="sm"
                  variant="rounded"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-bcc-text">
                    {m.name !== "" ? m.name : m.handle}
                  </p>
                  <p className="bcc-mono truncate text-[10px] tracking-[0.16em] text-bcc-text-muted">
                    @{m.handle}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

