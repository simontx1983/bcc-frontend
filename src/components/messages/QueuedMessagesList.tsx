"use client";

/**
 * QueuedMessagesList — the "Queued" tab of /messages.
 *
 * Renders the viewer's own pending pre-claim validator messages. Each
 * row links to the target validator and states plainly that the
 * message is waiting for that validator to be claimed. These are not
 * conversations, so there is no thread to open — the row is
 * informational until delivery moves it into the inbox.
 */

import type { Route } from "next";
import Link from "next/link";

import { Avatar } from "@/components/identity/Avatar";
import type { QueuedMessageItem } from "@/lib/api/types";

function formatDate(iso: string): string {
  if (iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function QueuedMessagesList({ items }: { items: QueuedMessageItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-bcc-border">
      {items.map((item) => (
        <li key={item.id} className="py-4">
          <div className="flex items-start gap-3">
            <Avatar
              avatarUrl={item.validator.avatar_url}
              handle={item.validator.slug}
              displayName={item.validator.name}
              size="sm"
              variant="rounded"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                {item.validator.slug !== "" ? (
                  <Link
                    href={`/v/${item.validator.slug}` as Route}
                    className="truncate font-serif text-[15px] text-bcc-text transition hover:text-bcc-text-secondary"
                  >
                    {item.validator.name}
                  </Link>
                ) : (
                  <span className="truncate font-serif text-[15px] text-bcc-text">
                    {item.validator.name}
                  </span>
                )}
                <time
                  className="bcc-mono shrink-0 text-[10px] tracking-[0.16em] text-bcc-text-muted"
                  dateTime={item.created_at}
                >
                  {formatDate(item.created_at)}
                </time>
              </div>

              <p className="mt-1 line-clamp-2 font-serif text-[13px] leading-snug text-bcc-text-secondary">
                {item.preview}
              </p>

              <p className="bcc-mono mt-2 inline-flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-safety">
                <span className="bcc-rail-dot" aria-hidden />
                QUEUED — DELIVERS WHEN THIS VALIDATOR IS CLAIMED
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
