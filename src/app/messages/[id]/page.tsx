"use client";

/**
 * /messages/[id] — single-conversation thread view.
 *
 * Reads `id` from the dynamic route segment, renders the participants
 * header + paginated message bubbles + composer. The thread auto-marks
 * messages viewed on every load (server side-effect of the GET).
 */

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { MessageComposer } from "@/components/messages/MessageComposer";
import { ThreadView } from "@/components/messages/ThreadView";
import { useConversation } from "@/hooks/useConversation";

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

  if (!validId) {
    return (
      <main className="pb-24">
        <Rail title="UNKNOWN" />
        <section className="mx-auto mt-10 max-w-3xl px-4 sm:px-7">
          <NotFound />
        </section>
      </main>
    );
  }

  return (
    <main className="pb-24">
      <Rail title={resolveRailTitle(query)} />

      <header className="mx-auto max-w-3xl px-4 sm:px-7 pt-12">
        <Link
          href={"/messages" as Route}
          className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep transition hover:text-cardstock"
        >
          ← INBOX
        </Link>
        <h1
          className="bcc-stencil mt-3 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2.5rem)" }}
        >
          {query.isSuccess ? resolveTitle(query.data.conversation) : "Loading…"}
        </h1>
        {query.isSuccess && query.data.conversation.is_group && (
          <p className="mt-2 bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep/70">
            GROUP · {query.data.conversation.participants.length} PARTICIPANTS
          </p>
        )}
      </header>

      <section className="mx-auto mt-8 max-w-3xl px-4 sm:px-7">
        {!isAuthed && session.status !== "loading" && (
          <p className="bcc-mono text-cardstock-deep">Sign in to view this conversation.</p>
        )}

        {isAuthed && query.isPending && (
          <p className="bcc-mono text-cardstock-deep">Loading conversation…</p>
        )}

        {isAuthed && query.isError && (query.error.code === "bcc_not_found"
          ? <NotFound />
          : (
            <div className="bcc-paper p-6">
              <p role="alert" className="bcc-mono text-safety">
                Couldn&apos;t load this conversation: {query.error.message}
              </p>
            </div>
          ))}

        {isAuthed && query.isSuccess && (
          <>
            <ThreadView items={query.data.items} viewerId={viewerId} />
            <div className="mt-6">
              <MessageComposer conversationId={conversationId} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Rail({ title }: { title: string }) {
  return (
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>BCC &nbsp;//&nbsp; MESSAGES</span>
        </span>
        <span className="bcc-mono text-cardstock/50">{title}</span>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-safety">NO TRACE</p>
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
