"use client";

/**
 * /messages/[id] — single-conversation thread view.
 *
 * Reads `id` from the dynamic route segment, renders the participants
 * header + paginated message bubbles + composer. The thread auto-marks
 * messages viewed on every load (server side-effect of the GET).
 *
 * F-319 (M-me4): loading was a bare text line, and a signed-out visitor
 * got plain text with no way on, under a heading stuck on "Loading…". The
 * load is now the house Skeleton (busy, with a screen-reader line), a
 * signed-out visitor gets a link to sign in and come back to this thread,
 * and the heading says "Loading…" only while something is loading.
 */

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRef } from "react";

import { RouteRail } from "@/components/layout/RouteRail";
import { MessageComposer } from "@/components/messages/MessageComposer";
import { ThreadView } from "@/components/messages/ThreadView";
import { useConversation } from "@/hooks/useConversation";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/Skeleton";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";
import { useSignInLink } from "@/lib/auth/sign-in-link";

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const session = useSession();
  const isAuthed = session.status === "authenticated";
  const viewerId = isAuthed && session.data?.user.id !== undefined
    ? Number.parseInt(session.data.user.id, 10)
    : null;

  const idParam = params?.id ?? "";
  const conversationId = Number.parseInt(idParam, 10);
  const validId = Number.isFinite(conversationId) && conversationId > 0;

  const query = useConversation(validId ? conversationId : null, {
    enabled: isAuthed,
  });
  // The thread scrolls this (the composer) into view with the newest
  // message, so the reply box is never left below the fold.
  const composerRef = useRef<HTMLDivElement>(null);
  const signIn = useSignInLink("/messages");
  const loading = session.status === "loading" || (isAuthed && query.isPending);

  if (!validId) {
    return (
      <main className="pb-24">
        <RouteRail kicker={"BCC \u00a0//\u00a0 MESSAGES"} label="UNKNOWN" />
        <section className="mx-auto mt-10 max-w-3xl px-2 sm:px-3">
          <NotFound />
        </section>
      </main>
    );
  }

  return (
    <main className="pb-24">
      <RouteRail kicker={"BCC \u00a0//\u00a0 MESSAGES"} label={resolveRailTitle(query)} />

      <header className="mx-auto max-w-3xl px-2 sm:px-3 pt-12">
        <Link
          href={"/messages" as Route}
          className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary transition hover:text-bcc-text"
        >
          ← INBOX
        </Link>
        <h1
          className="bcc-stencil mt-3 text-bcc-text leading-[0.95]"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2.5rem)" }}
        >
          {query.isSuccess
            ? resolveTitle(query.data.conversation)
            : loading
              ? "Loading…"
              : "Conversation"}
        </h1>
        {query.isSuccess && query.data.conversation.is_group && (
          <p className="mt-2 bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary">
            GROUP · {query.data.conversation.participants.length} PARTICIPANTS
          </p>
        )}
      </header>

      <section className="mx-auto mt-8 max-w-3xl px-2 sm:px-3">
        {!isAuthed && session.status !== "loading" && (
          <p className="bcc-mono text-bcc-text-secondary">
            <Link href={signIn.href} onClick={signIn.onClick} className="text-bcc-text underline underline-offset-2">
              Sign in
            </Link>{" "}
            to view this conversation.
          </p>
        )}

        {isAuthed && query.isPending && <ThreadSkeleton />}

        {isAuthed && query.isError && (query.error.code === "bcc_not_found"
          ? <NotFound />
          : (
            // F-300: a failed read is a 503 now (it used to look like an
            // empty thread). Retryable unless it is a permission denial.
            <div className="bcc-paper p-6">
              <LoadFailure
                message={humanizeCode(
                  query.error,
                  {
                    bcc_unauthorized:
                      "Your session expired — sign in again to view this conversation.",
                    bcc_forbidden:
                      "You're not a participant in this conversation.",
                    bcc_unavailable:
                      "Messages are temporarily unavailable. Try again shortly.",
                  },
                  "Couldn't load this conversation. Try again in a moment.",
                )}
                {...(isPermissionDenial(query.error) ||
                // No retry on a sign-in failure. Keyed on the 401 status, not
                // the code: since bcc-trust F-288 a 401 can say
                // bcc_token_expired / bcc_token_invalid instead.
                query.error.status === 401
                  ? {}
                  : { onRetry: () => void query.refetch() })}
              />
            </div>
          ))}

        {isAuthed && query.isSuccess && (
          <>
            <ThreadView
              conversationId={conversationId}
              items={query.data.items}
              viewerId={viewerId}
              bottomAnchorRef={composerRef}
            />
            <div ref={composerRef} className="mt-6">
              <MessageComposer
                conversationId={conversationId}
                canReply={query.data.conversation.can_reply}
              />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

/** Bubble-shaped placeholders, alternating sides like a thread. */
function ThreadSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p className="sr-only">Loading conversation…</p>
      <Skeleton className="h-12 w-3/5" />
      <Skeleton className="ml-auto h-16 w-2/3" />
      <Skeleton className="h-10 w-1/2" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-bcc-text-safety">NO TRACE</p>
      <h2 className="bcc-stencil text-3xl text-ink">Conversation not found.</h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Either it doesn&apos;t exist, or you&apos;re not a participant.
      </p>
      <Link
        href={"/messages" as Route}
        className="bcc-mono mt-6 inline-flex items-center gap-2 border border-cardstock-edge bg-cardstock px-3 py-1.5 text-[10px] tracking-[0.18em] text-ink transition hover:bg-cardstock-deep/40"
      >
        BACK TO INBOX
      </Link>
    </div>
  );
}

function resolveTitle(conversation: { is_group: boolean; peer: { display_name: string; handle: string } | null; participants: { display_name: string; handle: string }[] }): string {
  if (!conversation.is_group && conversation.peer !== null) {
    return conversation.peer.display_name !== ""
      ? conversation.peer.display_name
      : conversation.peer.handle;
  }
  const handles = conversation.participants
    .map((p) => p.display_name !== "" ? p.display_name : p.handle)
    .filter((s) => s !== "");
  return handles.length > 0 ? handles.join(", ") : "Conversation";
}

function resolveRailTitle(query: ReturnType<typeof useConversation>): string {
  if (!query.isSuccess) return "DIRECT // THREAD";
  return `THREAD #${query.data.conversation.id}`;
}
