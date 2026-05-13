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

import { useMembers } from "@/hooks/useMembers";
import { useStartConversationMutation } from "@/hooks/useStartConversation";
import { humanizeCode } from "@/lib/api/errors";
import {
  MESSAGE_BODY_MAX_LENGTH,
  type MemberSummary,
} from "@/lib/api/types";

const SEARCH_DEBOUNCE_MS = 250;
const PER_PAGE = 12;

export default function NewMessagePage() {
  const router = useRouter();
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  const [recipient, setRecipient] = useState<MemberSummary | null>(null);
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
            bcc_blocked: "You can't message this person.",
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

      <header className="mx-auto max-w-3xl px-4 sm:px-7 pt-12">
        <Link
          href={"/messages" as Route}
          className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep transition hover:text-cardstock"
        >
          ← INBOX
        </Link>
        <h1
          className="bcc-stencil mt-3 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
        >
          New message
        </h1>
      </header>

      <section className="mx-auto mt-10 max-w-3xl px-4 sm:px-7">
        {!isAuthed && session.status !== "loading" && (
          <p className="bcc-mono text-cardstock-deep">Sign in to start a conversation.</p>
        )}

        {isAuthed && (
          <form onSubmit={submit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
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
              <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
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
                className="font-serif resize-y rounded-sm border border-cardstock-edge/40 bg-cardstock-deep/30 px-3 py-2 text-[14px] leading-snug text-cardstock placeholder:text-cardstock-deep/60 focus-visible:border-cardstock focus-visible:outline-none disabled:opacity-50"
              />
              <span
                id="new-message-counter"
                aria-live="polite"
                hidden={body.length < MESSAGE_BODY_MAX_LENGTH - 200}
                className={
                  "bcc-mono text-[10px] tracking-[0.16em] " +
                  (body.length > MESSAGE_BODY_MAX_LENGTH
                    ? "text-safety"
                    : "text-cardstock-deep/60")
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
                className="bcc-mono inline-flex items-center gap-2 border-2 border-cardstock-edge px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock transition hover:bg-cardstock hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-cardstock"
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
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>BCC &nbsp;//&nbsp; MESSAGES</span>
        </span>
        <span className="bcc-mono text-cardstock/50">DIRECT &nbsp;//&nbsp; NEW</span>
      </div>
    </div>
  );
}

function SelectedRecipient({
  recipient,
  onClear,
}: {
  recipient: MemberSummary;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-cardstock-edge/40 bg-cardstock-deep/30 px-3 py-2">
      <Avatar src={recipient.avatar_url ?? ""} initial={(recipient.display_name || recipient.handle).slice(0, 1).toUpperCase()} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-cardstock">
          {recipient.display_name !== "" ? recipient.display_name : recipient.handle}
        </p>
        <p className="bcc-mono truncate text-[10px] tracking-[0.16em] text-cardstock-deep/70">
          @{recipient.handle}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep/70 transition hover:text-cardstock"
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
  onSelect: (member: MemberSummary) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={searchInput}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by handle or display name…"
        maxLength={64}
        className="bcc-mono w-full rounded-sm border border-cardstock-edge bg-cardstock-deep/40 px-3 py-2 text-cardstock outline-none placeholder:text-cardstock-deep/60 focus:border-blueprint focus:ring-1 focus:ring-blueprint"
      />

      {searchInput.length < 2 && (
        <p className="bcc-mono text-[10px] tracking-[0.16em] text-cardstock-deep/50">
          Type at least 2 characters to search.
        </p>
      )}

      {searchInput.length >= 2 && query.isPending && (
        <p className="bcc-mono text-[10px] tracking-[0.16em] text-cardstock-deep/50">
          Searching…
        </p>
      )}

      {searchInput.length >= 2 && query.isSuccess && query.data.items.length === 0 && (
        <p className="bcc-mono text-[10px] tracking-[0.16em] text-cardstock-deep/50">
          No members match.
        </p>
      )}

      {searchInput.length >= 2 && query.isSuccess && query.data.items.length > 0 && (
        <ul className="flex flex-col divide-y divide-cardstock-edge/30 rounded-sm border border-cardstock-edge/40">
          {query.data.items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelect(m)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-cardstock-deep/40"
              >
                <Avatar
                  src={m.avatar_url ?? ""}
                  initial={(m.display_name || m.handle).slice(0, 1).toUpperCase()}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-cardstock">
                    {m.display_name !== "" ? m.display_name : m.handle}
                  </p>
                  <p className="bcc-mono truncate text-[10px] tracking-[0.16em] text-cardstock-deep/70">
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

function Avatar({ src, initial }: { src: string; initial: string }) {
  if (src === "") {
    return (
      <span
        aria-hidden
        className="bcc-mono flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cardstock-deep text-xs text-cardstock"
      >
        {initial}
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full object-cover"
      loading="lazy"
    />
  );
}
