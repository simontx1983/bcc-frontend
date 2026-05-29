"use client";

/**
 * /messages — direct-message inbox.
 *
 * Sibling shape to /members: URL state `?page=N`, Prev/Next pagination,
 * explicit empty/error/loading branches per §N10. The list itself
 * doesn't poll (the unread-count badge does); refetch on focus is
 * enough to keep the inbox fresh when the viewer comes back to the
 * tab.
 */

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo } from "react";

import { ConversationList } from "@/components/messages/ConversationList";
import { useConversations } from "@/hooks/useConversations";

const PER_PAGE = 20;

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  const urlPage = useMemo(() => {
    const raw = searchParams.get("page");
    const parsed = raw === null ? 1 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [searchParams]);

  const query = useConversations({
    page: urlPage,
    perPage: PER_PAGE,
    enabled: isAuthed,
  });

  const goToPage = (next: number) => {
    const params = new URLSearchParams();
    if (next > 1) params.set("page", String(next));
    const qs = params.toString();
    router.replace((qs !== "" ? `/messages?${qs}` : "/messages") as Route, { scroll: false });
  };

  return (
    <main className="pb-24">
      <Rail />

      <header className="mx-auto max-w-3xl px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-safety">DIRECT</p>
        <h1
          className="bcc-stencil mt-3 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
        >
          Messages
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-base leading-relaxed text-cardstock-deep">
          Quiet conversations between operators. Click anyone&apos;s file
          to start a new thread.
        </p>
        <div className="mt-5">
          <Link
            href={"/messages/new" as Route}
            className="bcc-mono inline-flex items-center gap-2 border-2 border-cardstock-edge px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock transition hover:bg-cardstock hover:text-ink"
          >
            + NEW MESSAGE
          </Link>
        </div>
      </header>

      <section className="mx-auto mt-10 max-w-3xl px-4 sm:px-7">
        {!isAuthed && session.status !== "loading" && (
          <NotSignedIn />
        )}

        {isAuthed && query.isPending && (
          <p className="bcc-mono text-cardstock-deep">Loading conversations…</p>
        )}

        {isAuthed && query.isError && (
          <div className="bcc-paper p-6">
            <p role="alert" className="bcc-mono text-safety">
              Couldn&apos;t load your inbox: {query.error.message}
            </p>
          </div>
        )}

        {isAuthed && query.isSuccess && query.data.items.length === 0 && (
          <InboxEmpty />
        )}

        {isAuthed && query.isSuccess && query.data.items.length > 0 && (
          <>
            <ConversationList items={query.data.items} />
            <Pagination
              page={query.data.pagination.page}
              totalPages={query.data.pagination.total_pages}
              onPage={goToPage}
            />
          </>
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
        <span className="bcc-mono text-cardstock/50">DIRECT &nbsp;//&nbsp; INBOX</span>
      </div>
    </div>
  );
}

function NotSignedIn() {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-safety">SIGN IN REQUIRED</p>
      <h2 className="bcc-stencil text-3xl text-ink">
        Sign in to read your messages.
      </h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Direct messages are private to your account.
      </p>
      <Link
        href="/login"
        className="bcc-mono mt-6 inline-flex items-center gap-2 border-2 border-ink/40 px-3 py-1.5 text-[10px] tracking-[0.18em] text-ink transition hover:bg-ink hover:text-cardstock"
      >
        SIGN IN
      </Link>
    </div>
  );
}

function InboxEmpty() {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-safety">QUIET INBOX</p>
      <h2 className="bcc-stencil text-3xl text-ink">No conversations yet.</h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Start one from the directory — every operator has a file, every
        file has a Message button.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href={"/messages/new" as Route}
          className="bcc-mono inline-flex items-center gap-2 border-2 border-ink/40 px-3 py-1.5 text-[10px] tracking-[0.18em] text-ink transition hover:bg-ink hover:text-cardstock"
        >
          + NEW MESSAGE
        </Link>
        <Link
          href="/members"
          className="bcc-mono inline-flex items-center gap-2 border border-cardstock-edge bg-cardstock px-3 py-1.5 text-[10px] tracking-[0.18em] text-ink transition hover:bg-cardstock-deep/40"
        >
          BROWSE MEMBERS
        </Link>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      className="bcc-mono mt-8 flex items-center justify-between gap-3 text-[11px] tracking-[0.16em] text-cardstock-deep"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="border-2 border-cardstock-edge px-3 py-1 transition hover:border-ink/50 hover:text-ink disabled:opacity-40"
      >
        ← PREV
      </button>
      <span>
        PAGE {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPage(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="border-2 border-cardstock-edge px-3 py-1 transition hover:border-ink/50 hover:text-ink disabled:opacity-40"
      >
        NEXT →
      </button>
    </nav>
  );
}
