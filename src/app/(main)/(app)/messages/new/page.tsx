"use client";

/**
 * /messages/new — start a new 1-on-1 conversation.
 *
 * Two-step UX in one page: pick a recipient (search via the existing
 * /members hook), then write the first message + send. On success the
 * server returns the conversation_id and we navigate to /messages/[id]
 * to land in the thread.
 *
 * Deep-link mode: `?to_page=<id>&to_kind=validator` pins a validator
 * page as the recipient and skips the member picker. The param is
 * `to_page`, NOT `page` — `?page=N` is already the inbox pagination
 * convention and reusing it here would collide.
 *
 * Pinned sends address the PAGE (`{page_id, body}`), never a resolved
 * operator id. The server re-resolves the destination at send time, so
 * a page claimed between render and submit still routes correctly. That
 * also means the response is a union: a claimed page answers with a
 * conversation to navigate to, an unclaimed one answers `queued: true`
 * with NO conversation — navigating there would 404.
 *
 * Group convos are intentionally not creatable here (per V1 scope —
 * we render existing groups read-only but don't expose the
 * multi-recipient picker). PeepSo's native UI still creates groups
 * the old-fashioned way.
 */

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/identity/Avatar";
import { useCardEntity } from "@/hooks/useCardEntity";
import { useMembers } from "@/hooks/useMembers";
import { useStartConversationMutation } from "@/hooks/useStartConversation";
import { humanizeCode } from "@/lib/api/errors";
import {
  MESSAGE_BODY_MAX_LENGTH,
  type Card,
} from "@/lib/api/types";

const SEARCH_DEBOUNCE_MS = 250;
const PER_PAGE = 12;

/** Shown after a send that parked in the unclaimed-page queue. */
const QUEUED_CONFIRMATION =
  "Message queued. It will be delivered when the validator is claimed by a verified operator.";

function NewMessagePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  const [recipient, setRecipient] = useState<Card | null>(null);
  const [pinCleared, setPinCleared] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);

  // ── Deep-link pin ──────────────────────────────────────────────────
  const pinnedPageId = useMemo(() => {
    const raw = searchParams.get("to_page");
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  // Only validator pages are addressable this way today. An unknown
  // to_kind falls through to the ordinary member picker rather than
  // guessing.
  const wantsPin =
    !pinCleared &&
    pinnedPageId !== null &&
    searchParams.get("to_kind") === "validator";

  const pinnedQuery = useCardEntity(
    "validator",
    wantsPin && pinnedPageId !== null ? String(pinnedPageId) : null,
    { enabled: isAuthed && wantsPin },
  );

  // Re-check `wantsPin` and the kind on the way out so a cleared pin
  // can't resurrect from the React Query cache.
  const pinnedCard =
    wantsPin &&
    pinnedQuery.data !== undefined &&
    pinnedQuery.data.card_kind === "validator"
      ? pinnedQuery.data
      : null;

  const activeRecipient = pinnedCard ?? recipient;

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
    enabled: isAuthed && activeRecipient === null && debouncedSearch.length >= 2,
  });

  const mutation = useStartConversationMutation({
    onSuccess: (data) => {
      // `queued` is a literal-true discriminant and the two response
      // variants share no keys, so its presence IS the whole test. The
      // queued branch has no conversation to open — stay put.
      if ("queued" in data) {
        setBody("");
        setQueuedNotice(QUEUED_CONFIRMATION);
        return;
      }
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
            bcc_queue_full:
              "This validator's message queue is full. Try again later.",
            bcc_queue_limit:
              "You already have a message queued for this validator.",
            // Deliberately generic: the server collapses "recipient has
            // DMs off" and "mutually blocked" into one code as an
            // info-leak shield. Do not split this copy.
            bcc_messaging_unavailable:
              "Messaging isn't available for this recipient.",
            bcc_fraud_locked:
              "Your account is temporarily restricted from sending messages.",
          },
          "Couldn't start the conversation.",
        ),
      );
    },
  });

  const trimmed = body.trim();
  const canSend = useMemo(
    () =>
      activeRecipient !== null &&
      trimmed !== "" &&
      body.length <= MESSAGE_BODY_MAX_LENGTH &&
      !mutation.isPending,
    [activeRecipient, trimmed, body.length, mutation.isPending],
  );

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;
    setError(null);
    setQueuedNotice(null);
    // Pinned pages address the PAGE — the server re-resolves it to an
    // operator inbox or the queue at send time. Never resolve it here.
    if (pinnedCard !== null) {
      mutation.mutate({ page_id: pinnedCard.id, body: trimmed });
      return;
    }
    if (recipient !== null) {
      mutation.mutate({ recipient_id: recipient.id, body: trimmed });
    }
  };

  const clearRecipient = () => {
    if (pinnedCard !== null) {
      setPinCleared(true);
    }
    setRecipient(null);
    setSearchInput("");
    setDebouncedSearch("");
    setQueuedNotice(null);
  };

  // Server-owned composer notice: names the real destination before the
  // viewer writes. Both branches read `messaging.destination` — never
  // `is_claimed`, which can't tell never-claimed from previously-claimed.
  const pinnedNotice = useMemo(() => {
    if (pinnedCard === null) return null;
    const destination = pinnedCard.messaging?.destination;
    if (destination === "queue") {
      return "This validator has not been claimed yet. Your message will be queued for its first verified operator.";
    }
    const operator = pinnedCard.messaging?.operator ?? null;
    if (destination === "operator" && operator !== null) {
      return `You're messaging @${operator.handle}, the verified operator of ${pinnedCard.name}.`;
    }
    return null;
  }, [pinnedCard]);

  return (
    <main className="pb-24">
      <Rail />

      <header className="mx-auto max-w-3xl px-2 sm:px-3 pt-12">
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

      <section className="mx-auto mt-10 max-w-3xl px-2 sm:px-3">
        {!isAuthed && session.status !== "loading" && (
          <p className="bcc-mono text-cardstock-deep">Sign in to start a conversation.</p>
        )}

        {isAuthed && (
          <form onSubmit={submit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
                TO
              </span>
              {wantsPin && pinnedQuery.isPending && (
                <p className="bcc-mono text-[10px] tracking-[0.16em] text-cardstock-deep/50">
                  Loading validator…
                </p>
              )}

              {wantsPin && pinnedQuery.isError && (
                <p role="alert" className="bcc-mono text-[11px] text-safety">
                  {humanizeCode(
                    pinnedQuery.error,
                    {
                      bcc_not_found: "That validator page no longer exists.",
                      bcc_unauthorized:
                        "Your session expired — sign in again to message this validator.",
                    },
                    "Couldn't load that validator. Pick a recipient instead.",
                  )}
                </p>
              )}

              {activeRecipient !== null ? (
                <SelectedRecipient
                  recipient={activeRecipient}
                  onClear={clearRecipient}
                />
              ) : (
                (!wantsPin || pinnedQuery.isError) && (
                  <RecipientPicker
                    searchInput={searchInput}
                    onSearchChange={setSearchInput}
                    query={memberQuery}
                    onSelect={(m) => {
                      setRecipient(m);
                      setSearchInput("");
                    }}
                  />
                )
              )}

              {pinnedNotice !== null && (
                <p className="font-serif text-[13px] leading-relaxed text-cardstock-deep">
                  {pinnedNotice}
                </p>
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

            {queuedNotice !== null && (
              <p role="status" className="bcc-mono text-[11px] text-cardstock">
                {queuedNotice}
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

// useSearchParams() opts the tree into client-side rendering, so the
// Suspense boundary is mandatory (same arrangement as /messages).
export default function NewMessagePage() {
  return (
    <Suspense>
      <NewMessagePageContent />
    </Suspense>
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
  recipient: Card;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-cardstock-edge/40 bg-cardstock-deep/30 px-3 py-2">
      <Avatar
        avatarUrl={recipient.crest.image_url}
        handle={recipient.handle}
        displayName={recipient.name}
        size="sm"
        variant="rounded"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-cardstock">
          {recipient.name !== "" ? recipient.name : recipient.handle}
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
                  avatarUrl={m.crest.image_url}
                  handle={m.handle}
                  displayName={m.name}
                  size="sm"
                  variant="rounded"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-cardstock">
                    {m.name !== "" ? m.name : m.handle}
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

