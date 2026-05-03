"use client";

/**
 * ModerationQueue — admin queue list with filter tabs + actions.
 *
 * Reads from useAdminReports; per-row actions use useResolveAdminReport.
 * The 403 error path renders a friendly "admin access required" panel
 * (the API enforces; we mirror in the UI to avoid blank screens for
 * non-admins who hit the URL directly).
 */

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import {
  useAdminReports,
  useResolveAdminReport,
} from "@/hooks/useAdminReports";
import type {
  BccApiError,
  ModerationAction,
  ModerationReportItem,
  ModerationStatusFilter,
} from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

const FILTERS: Array<{ key: ModerationStatusFilter; label: string }> = [
  { key: "pending",   label: "Pending" },
  { key: "resolved",  label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all",       label: "All" },
];

export function ModerationQueue() {
  const [filter, setFilter] = useState<ModerationStatusFilter>("pending");
  const [page, setPage] = useState(1);

  // Reset page when the filter flips so the user lands on page 1 of
  // the new view rather than (e.g.) page 4 of 2.
  const handleFilterChange = (next: ModerationStatusFilter) => {
    setFilter(next);
    setPage(1);
  };

  const query = useAdminReports(filter, page);

  if (query.isPending) {
    return (
      <div className="bcc-panel p-6">
        <FilterTabs value={filter} onChange={handleFilterChange} />
        <p className="bcc-mono mt-4 text-ink-soft">Loading reports…</p>
      </div>
    );
  }

  if (query.isError) {
    return <QueueError filter={filter} onChange={handleFilterChange} error={query.error} />;
  }

  const { items, pagination } = query.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="bcc-panel p-4">
        <FilterTabs value={filter} onChange={handleFilterChange} />
      </div>

      {items.length === 0 ? (
        <div className="bcc-panel p-6">
          <p
            className="bcc-mono mb-3 text-safety"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            QUEUE CLEAR
          </p>
          <p className="font-serif italic text-ink-soft">
            No reports {filter === "all" ? "on file." : `with status "${filter}".`}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <ReportRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {pagination.total_pages > 1 && (
        <nav
          className="bcc-mono flex items-center justify-between gap-3 text-[11px] tracking-[0.16em] text-ink-soft"
          aria-label="Pagination"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="border-2 border-cardstock-edge px-3 py-1 transition hover:border-ink/50 hover:text-ink disabled:opacity-50"
          >
            ← PREV
          </button>
          <span>
            PAGE {pagination.page} / {pagination.total_pages} · {pagination.total} TOTAL
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pagination.total_pages}
            className="border-2 border-cardstock-edge px-3 py-1 transition hover:border-ink/50 hover:text-ink disabled:opacity-50"
          >
            NEXT →
          </button>
        </nav>
      )}
    </div>
  );
}

interface FilterTabsProps {
  value: ModerationStatusFilter;
  onChange: (next: ModerationStatusFilter) => void;
}

function FilterTabs({ value, onChange }: FilterTabsProps) {
  return (
    <div role="tablist" aria-label="Report status filter" className="flex flex-wrap gap-2">
      {FILTERS.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={
              "bcc-mono inline-flex items-center border-2 px-3 py-1.5 text-[11px] tracking-[0.18em] transition " +
              (active
                ? "border-ink bg-ink text-cardstock"
                : "border-cardstock-edge bg-cardstock-deep/40 text-ink-soft hover:border-ink/50 hover:text-ink")
            }
          >
            {tab.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

interface QueueErrorProps {
  filter: ModerationStatusFilter;
  onChange: (next: ModerationStatusFilter) => void;
  error: BccApiError;
}

function QueueError({ filter, onChange, error }: QueueErrorProps) {
  if (error.code === "bcc_forbidden") {
    return (
      <div className="bcc-panel p-6">
        <p
          className="bcc-mono mb-3 text-safety"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
        >
          ADMIN ACCESS REQUIRED
        </p>
        <p className="font-serif italic text-ink-soft">
          The moderation queue is restricted to platform admins. If you
          should have access, ask an admin to grant your account the
          <code className="bcc-mono mx-1 text-[12px]">manage_options</code>
          capability.
        </p>
      </div>
    );
  }

  return (
    <div className="bcc-panel p-6">
      <FilterTabs value={filter} onChange={onChange} />
      <p role="alert" className="bcc-mono mt-4 text-safety">
        Couldn&apos;t load reports: {error.message}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-row card with action buttons
// ─────────────────────────────────────────────────────────────────────

function ReportRow({ item }: { item: ModerationReportItem }) {
  const mutation = useResolveAdminReport(item.id);

  const trigger = (action: ModerationAction) => {
    mutation.mutate(action);
  };

  const profileHref =
    item.reporter.profile_url !== ""
      ? (item.reporter.profile_url as Route)
      : null;

  return (
    <li
      className={
        "bcc-panel flex flex-col gap-3 p-5 " +
        (item.currently_hidden ? "border-l-4 border-l-safety" : "")
      }
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className="bcc-mono inline-flex items-center border-2 border-cardstock-edge px-2 py-0.5 text-[10px] tracking-[0.18em] text-ink-soft"
            data-status={item.status_label.toLowerCase()}
          >
            {item.status_label}
          </span>
          <span
            className="bcc-mono inline-flex items-center border-2 border-safety/50 px-2 py-0.5 text-[10px] tracking-[0.18em] text-safety"
          >
            {item.reason_code.toUpperCase()}
          </span>
          {item.currently_hidden && (
            <span
              className="bcc-mono inline-flex items-center border-2 border-safety bg-safety/10 px-2 py-0.5 text-[10px] tracking-[0.18em] text-safety"
            >
              HIDDEN
            </span>
          )}
        </div>
        <span className="bcc-mono text-[10px] text-ink-soft">
          report #{item.id} · {formatRelativeTime(item.created_at)}
        </span>
      </header>

      <div className="flex flex-col gap-1">
        <p className="bcc-mono text-[11px] tracking-[0.14em] text-ink-soft">
          REPORTED BY{" "}
          {profileHref !== null ? (
            <Link href={profileHref} className="text-ink hover:underline">
              @{item.reporter.handle}
            </Link>
          ) : (
            <span className="text-ink">{item.reporter.display_name}</span>
          )}
        </p>
        {item.comment !== "" && (
          <p className="font-serif italic text-ink">&ldquo;{item.comment}&rdquo;</p>
        )}
      </div>

      <div className="bcc-paper flex flex-col gap-1 px-4 py-3">
        <p className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
          TARGET · {item.target.post_kind?.toUpperCase() ?? "DELETED"}{" "}
          {item.target.posted_at !== null && (
            <span> · {formatRelativeTime(item.target.posted_at)}</span>
          )}
        </p>
        {item.target.preview !== "" ? (
          <p className="font-serif text-ink">{item.target.preview}</p>
        ) : (
          <p className="font-serif italic text-ink-soft">
            (No preview available — click through on a future build to view in full.)
          </p>
        )}
      </div>

      {mutation.isError && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          Couldn&apos;t apply action: {mutation.error.message}
        </p>
      )}

      <footer className="flex flex-wrap items-center justify-end gap-2">
        {item.status === 0 && !item.currently_hidden && (
          <ActionButton
            label="Hide"
            tone="primary"
            onClick={() => trigger("hide")}
            disabled={mutation.isPending}
          />
        )}
        {item.currently_hidden && (
          <ActionButton
            label="Restore"
            tone="ghost"
            onClick={() => trigger("restore")}
            disabled={mutation.isPending}
          />
        )}
        {item.status === 0 && (
          <ActionButton
            label="Dismiss"
            tone="ghost"
            onClick={() => trigger("dismiss")}
            disabled={mutation.isPending}
          />
        )}
        {mutation.isPending && (
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
            WORKING…
          </span>
        )}
      </footer>
    </li>
  );
}

interface ActionButtonProps {
  label: string;
  tone: "primary" | "ghost";
  onClick: () => void;
  disabled: boolean;
}

function ActionButton({ label, tone, onClick, disabled }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "bcc-mono border-2 px-3 py-1.5 text-[11px] tracking-[0.18em] transition disabled:opacity-50 " +
        (tone === "primary"
          ? "border-ink bg-ink text-cardstock hover:bg-blueprint"
          : "border-cardstock-edge text-ink-soft hover:border-ink/50 hover:text-ink")
      }
    >
      {label.toUpperCase()}
    </button>
  );
}

