"use client";

/**
 * ModerationQueue — admin queue list with filter tabs + filter chips
 * + keyboard shortcuts + per-row actions.
 *
 * Reads from useAdminReports; per-row actions use useResolveAdminReport.
 * The 403 error path renders a friendly "admin access required" panel
 * (the API enforces; we mirror in the UI to avoid blank screens for
 * non-admins who hit the URL directly).
 *
 * Filtering surface (server-side):
 *   - Status tabs (existing): pending / resolved / dismissed / all
 *   - Reason chips (new): spam / harassment / hate / violence /
 *     misinformation / other / [any]
 *   - Post-kind chips (new): status / blog / review / photo / gif / [any]
 *   - Reporter handle search (new): debounced 200ms
 *   - Date range (new): since / until — native <input type="date">
 *
 * Each filter posts back to the URL-equivalent server param via the
 * useAdminReports hook; cache key includes every filter so flips
 * never serve a previous filter's data.
 *
 * Keyboard shortcuts (admin power-user):
 *   - J / K           — focus next/previous report row
 *   - H               — Hide focused row (when allowed)
 *   - D               — Dismiss focused row (when allowed)
 *   - R               — Restore focused row (when allowed)
 *   - /               — focus the reporter-handle search
 *   - ?               — open the shortcut overlay
 *   - Escape          — close the overlay
 *
 * Letter shortcuts are suppressed while the user is typing in any
 * input/textarea (handled by useKeyboardShortcuts). The overlay is
 * a lightweight modal — no portal — that mirrors the brutalist look
 * of the rest of the admin chrome.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { FilterChipRow } from "@/components/ui/FilterChipRow";
import {
  useAdminReports,
  useResolveAdminReport,
  type AdminReportsFilters,
  DEFAULT_ADMIN_REPORTS_FILTERS,
} from "@/hooks/useAdminReports";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type {
  BccApiError,
  ContentReportReason,
  ModerationAction,
  ModerationReportItem,
  ModerationStatusFilter,
  ModerationTargetPostKind,
} from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

const STATUS_FILTERS: Array<{ key: ModerationStatusFilter; label: string }> = [
  { key: "pending",   label: "Pending" },
  { key: "resolved",  label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all",       label: "All" },
];

const REASON_OPTIONS: Array<{ value: ContentReportReason | null; label: string }> = [
  { value: null,             label: "Any" },
  { value: "spam",           label: "Spam" },
  { value: "harassment",     label: "Harassment" },
  { value: "hate",           label: "Hate" },
  { value: "violence",       label: "Violence" },
  { value: "misinformation", label: "Misinformation" },
  { value: "other",          label: "Other" },
];

const POST_KIND_OPTIONS: Array<{ value: ModerationTargetPostKind | null; label: string }> = [
  { value: null,     label: "Any" },
  { value: "status", label: "Status" },
  { value: "blog",   label: "Blog" },
  { value: "review", label: "Review" },
  { value: "photo",  label: "Photo" },
  { value: "gif",    label: "GIF" },
];

/**
 * Convert a date input value (`YYYY-MM-DD`) to an ISO-8601 UTC
 * datetime suitable for the backend's `since`/`until` filters.
 *
 * Backend `DateTimeImmutable` parses naive datetimes in the server's
 * default timezone — the brief from backend-implementer explicitly
 * asks the FE to send a `Z` suffix so the value is unambiguous.
 *
 * `since` → start of the day; `until` → end of the day.
 */
function dateToIso(value: string, edge: "since" | "until"): string {
  if (value === "") return "";
  return edge === "since" ? `${value}T00:00:00Z` : `${value}T23:59:59Z`;
}

export function ModerationQueue() {
  const [filters, setFilters] = useState<AdminReportsFilters>(
    DEFAULT_ADMIN_REPORTS_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // Reporter search input is debounced — the user types fast, but we
  // don't want a roundtrip per keystroke. 200ms is the established
  // beat (DirectoryFilters search uses the same).
  const [handleDraft, setHandleDraft] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => {
      setFilters((prev) => {
        if (prev.reporterHandle === handleDraft) return prev;
        // A debounced filter flip is still a filter flip — reset to
        // page 1 so the user lands on the first page of the narrowed
        // view rather than (e.g.) page 4 of 2.
        setPage(1);
        return { ...prev, reporterHandle: handleDraft };
      });
    }, 200);
    return () => window.clearTimeout(id);
  }, [handleDraft]);

  // Date inputs are local YYYY-MM-DD; converted to ISO on the way to
  // the hook. Stored in UI state as the raw input value so the date
  // picker keeps its display.
  const [sinceDraft, setSinceDraft] = useState("");
  const [untilDraft, setUntilDraft] = useState("");
  useEffect(() => {
    setFilters((prev) => {
      const nextSince = dateToIso(sinceDraft, "since");
      const nextUntil = dateToIso(untilDraft, "until");
      if (prev.since === nextSince && prev.until === nextUntil) return prev;
      // See note on the reporter-handle effect — date flips are filter
      // flips and must reset pagination.
      setPage(1);
      return { ...prev, since: nextSince, until: nextUntil };
    });
  }, [sinceDraft, untilDraft]);

  // Reset page when ANY filter flips so the user lands on page 1 of
  // the new view rather than (e.g.) page 4 of 2.
  const updateFilter = <K extends keyof AdminReportsFilters>(
    key: K,
    value: AdminReportsFilters[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleStatusChange = (next: ModerationStatusFilter) => updateFilter("status", next);
  const handleReasonChange = (next: ContentReportReason | null) => updateFilter("reason", next);
  const handlePostKindChange = (next: ModerationTargetPostKind | null) => updateFilter("postKind", next);

  const query = useAdminReports(filters, page);

  // Track which row is keyboard-focused. Index into `items`. Reset to
  // 0 whenever the items array identity changes (page or filter flip).
  const [focusedIndex, setFocusedIndex] = useState(0);
  const items: ModerationReportItem[] = query.data?.items ?? [];
  useEffect(() => {
    setFocusedIndex((prev) => (prev >= items.length ? 0 : prev));
  }, [items]);

  const focusedItem = items[focusedIndex] ?? null;

  // Refs to row elements so J/K can scroll them into view. Keyed by
  // report id — stable across re-orderings.
  const rowRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const setRowRef = (id: number) => (el: HTMLLIElement | null) => {
    if (el === null) {
      rowRefs.current.delete(id);
    } else {
      rowRefs.current.set(id, el);
    }
  };
  const scrollToFocused = (idx: number) => {
    const item = items[idx];
    if (!item) return;
    const el = rowRefs.current.get(item.id);
    // Reduced-motion users get an instant jump (`auto`) instead of the
    // smooth-scroll easing — same pattern as ThreadView's auto-scroll
    // and the rest of the codebase's motion-honouring conventions.
    el?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    el?.focus({ preventScroll: true });
  };

  // Imperative-but-scoped: per-action mutation lives on each row. The
  // shortcut needs to dispatch into the focused row. We expose the
  // mutation through a ref callback set inside ReportRow so the
  // shortcut can call it without lifting the mutation hook (which would
  // duplicate one per row regardless of which is focused).
  const rowActionRef = useRef<Map<number, (action: ModerationAction) => void>>(
    new Map(),
  );
  const setRowAction = (id: number, fn: ((action: ModerationAction) => void) | null) => {
    if (fn === null) rowActionRef.current.delete(id);
    else rowActionRef.current.set(id, fn);
  };

  const triggerOnFocused = (action: ModerationAction) => {
    if (focusedItem === null) return;
    // Mirror the per-row visibility rules so the shortcut never fires
    // an action the user couldn't click.
    if (action === "hide" && (focusedItem.status !== 0 || focusedItem.currently_hidden)) return;
    if (action === "restore" && !focusedItem.currently_hidden) return;
    if (action === "dismiss" && focusedItem.status !== 0) return;
    rowActionRef.current.get(focusedItem.id)?.(action);
  };

  const reporterInputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts(
    [
      {
        key: "?",
        description: "Open shortcut help",
        run: () => setShortcutsOpen(true),
      },
      {
        key: "Escape",
        description: "Close shortcut help",
        run: () => {
          if (shortcutsOpen) setShortcutsOpen(false);
        },
        when: () => shortcutsOpen,
      },
      {
        key: "code:Slash",
        label: "/",
        description: "Focus the reporter-handle search",
        run: (event) => {
          event.preventDefault();
          reporterInputRef.current?.focus();
        },
      },
      {
        key: "j",
        description: "Focus next report",
        run: (event) => {
          event.preventDefault();
          setFocusedIndex((prev) => {
            const next = Math.min(items.length - 1, prev + 1);
            scrollToFocused(next);
            return next;
          });
        },
        when: () => items.length > 0,
      },
      {
        key: "k",
        description: "Focus previous report",
        run: (event) => {
          event.preventDefault();
          setFocusedIndex((prev) => {
            const next = Math.max(0, prev - 1);
            scrollToFocused(next);
            return next;
          });
        },
        when: () => items.length > 0,
      },
      {
        key: "h",
        description: "Hide the focused report",
        run: () => triggerOnFocused("hide"),
        when: () => focusedItem !== null,
      },
      {
        key: "d",
        description: "Dismiss the focused report",
        run: () => triggerOnFocused("dismiss"),
        when: () => focusedItem !== null,
      },
      {
        key: "r",
        description: "Restore the focused report",
        run: () => triggerOnFocused("restore"),
        when: () => focusedItem !== null,
      },
    ],
    true,
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <FilterPanel
          filters={filters}
          onStatusChange={handleStatusChange}
          onReasonChange={handleReasonChange}
          onPostKindChange={handlePostKindChange}
          handleDraft={handleDraft}
          onHandleDraftChange={setHandleDraft}
          sinceDraft={sinceDraft}
          onSinceDraftChange={setSinceDraft}
          untilDraft={untilDraft}
          onUntilDraftChange={setUntilDraft}
          reporterInputRef={reporterInputRef}
        />
        <p className="bcc-mono text-ink-soft">Loading reports…</p>
      </div>
    );
  }

  if (query.isError) {
    return <QueueError filter={filters.status} onChange={handleStatusChange} error={query.error} />;
  }

  const { pagination } = query.data;

  return (
    <div className="flex flex-col gap-4">
      <FilterPanel
        filters={filters}
        onStatusChange={handleStatusChange}
        onReasonChange={handleReasonChange}
        onPostKindChange={handlePostKindChange}
        handleDraft={handleDraft}
        onHandleDraftChange={setHandleDraft}
        sinceDraft={sinceDraft}
        onSinceDraftChange={setSinceDraft}
        untilDraft={untilDraft}
        onUntilDraftChange={setUntilDraft}
        reporterInputRef={reporterInputRef}
      />

      <KeyboardHint onOpenOverlay={() => setShortcutsOpen(true)} />

      {items.length === 0 ? (
        <div className="bcc-panel p-6">
          <p
            className="bcc-mono mb-3 text-safety"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            QUEUE CLEAR
          </p>
          <p className="font-serif italic text-ink-soft">
            No reports {filters.status === "all" ? "match the current filters." : `with status "${filters.status}".`}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, idx) => (
            <ReportRow
              key={item.id}
              item={item}
              focused={idx === focusedIndex}
              onFocus={() => setFocusedIndex(idx)}
              setActionDispatcher={setRowAction}
              setRef={setRowRef(item.id)}
            />
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

      {shortcutsOpen && <ShortcutOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Filter panel — status tabs + chip rows + reporter search + date range
// ─────────────────────────────────────────────────────────────────────

interface FilterPanelProps {
  filters: AdminReportsFilters;
  onStatusChange: (next: ModerationStatusFilter) => void;
  onReasonChange: (next: ContentReportReason | null) => void;
  onPostKindChange: (next: ModerationTargetPostKind | null) => void;
  handleDraft: string;
  onHandleDraftChange: (next: string) => void;
  sinceDraft: string;
  onSinceDraftChange: (next: string) => void;
  untilDraft: string;
  onUntilDraftChange: (next: string) => void;
  reporterInputRef: React.RefObject<HTMLInputElement | null>;
}

function FilterPanel({
  filters,
  onStatusChange,
  onReasonChange,
  onPostKindChange,
  handleDraft,
  onHandleDraftChange,
  sinceDraft,
  onSinceDraftChange,
  untilDraft,
  onUntilDraftChange,
  reporterInputRef,
}: FilterPanelProps) {
  return (
    <section
      aria-label="Report filters"
      className="bcc-panel flex flex-col gap-5 p-5"
    >
      <StatusTabs value={filters.status} onChange={onStatusChange} />

      <FilterChipRow
        label="REASON"
        options={REASON_OPTIONS}
        selected={filters.reason}
        onSelect={onReasonChange}
      />

      <FilterChipRow
        label="POST KIND"
        options={POST_KIND_OPTIONS}
        selected={filters.postKind}
        onSelect={onPostKindChange}
      />

      <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="bcc-mod-reporter"
            className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep"
          >
            REPORTER · / TO FOCUS
          </label>
          <input
            id="bcc-mod-reporter"
            ref={reporterInputRef}
            type="search"
            value={handleDraft}
            onChange={(e) => onHandleDraftChange(e.target.value)}
            placeholder="Handle fragment…"
            className="bcc-mono w-full bg-cardstock px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none ring-1 ring-cardstock-edge focus:ring-2 focus:ring-blueprint"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="bcc-mod-since"
            className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep"
          >
            SINCE
          </label>
          <input
            id="bcc-mod-since"
            type="date"
            value={sinceDraft}
            onChange={(e) => onSinceDraftChange(e.target.value)}
            className="bcc-mono bg-cardstock px-3 py-2 text-sm text-ink ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="bcc-mod-until"
            className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep"
          >
            UNTIL
          </label>
          <input
            id="bcc-mod-until"
            type="date"
            value={untilDraft}
            onChange={(e) => onUntilDraftChange(e.target.value)}
            className="bcc-mono bg-cardstock px-3 py-2 text-sm text-ink ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint"
          />
        </div>
      </div>
    </section>
  );
}

interface StatusTabsProps {
  value: ModerationStatusFilter;
  onChange: (next: ModerationStatusFilter) => void;
}

function StatusTabs({ value, onChange }: StatusTabsProps) {
  return (
    <div role="tablist" aria-label="Report status filter" className="flex flex-wrap gap-2">
      {STATUS_FILTERS.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={
              "bcc-mono inline-flex min-h-[36px] items-center border-2 px-3 py-1.5 text-[11px] tracking-[0.18em] transition " +
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

interface KeyboardHintProps {
  onOpenOverlay: () => void;
}

function KeyboardHint({ onOpenOverlay }: KeyboardHintProps) {
  return (
    <div className="bcc-mono flex items-center justify-end gap-2 text-[10px] tracking-[0.18em] text-ink-soft/70">
      <button
        type="button"
        onClick={onOpenOverlay}
        className="inline-flex items-center gap-1.5 hover:text-ink"
        aria-label="Open keyboard-shortcut help"
      >
        <kbd className="border border-cardstock-edge px-1.5 py-0.5 text-[10px] not-italic">?</kbd>
        <span>shortcuts</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-row card with action buttons
// ─────────────────────────────────────────────────────────────────────

interface ReportRowProps {
  item: ModerationReportItem;
  focused: boolean;
  onFocus: () => void;
  setActionDispatcher: (
    id: number,
    fn: ((action: ModerationAction) => void) | null,
  ) => void;
  setRef: (el: HTMLLIElement | null) => void;
}

function ReportRow({
  item,
  focused,
  onFocus,
  setActionDispatcher,
  setRef,
}: ReportRowProps) {
  const mutation = useResolveAdminReport(item.id);

  const trigger = useMemo(
    () => (action: ModerationAction) => {
      mutation.mutate(action);
    },
    [mutation],
  );

  // Register / unregister this row's dispatcher with the parent so
  // keyboard shortcuts can fire actions against the focused row.
  useEffect(() => {
    setActionDispatcher(item.id, trigger);
    return () => setActionDispatcher(item.id, null);
  }, [item.id, trigger, setActionDispatcher]);

  const profileHref =
    item.reporter.profile_url !== ""
      ? (item.reporter.profile_url as Route)
      : null;

  return (
    <li
      ref={setRef}
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onClick={onFocus}
      className={
        "bcc-panel flex flex-col gap-3 p-5 transition outline-none " +
        (item.currently_hidden ? "border-l-4 border-l-safety " : "") +
        (focused ? "ring-2 ring-blueprint" : "")
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
            (No preview available — open the activity directly to view in full.)
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
            shortcut="H"
            tone="primary"
            onClick={() => trigger("hide")}
            disabled={mutation.isPending}
          />
        )}
        {item.currently_hidden && (
          <ActionButton
            label="Restore"
            shortcut="R"
            tone="ghost"
            onClick={() => trigger("restore")}
            disabled={mutation.isPending}
          />
        )}
        {item.status === 0 && (
          <ActionButton
            label="Dismiss"
            shortcut="D"
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
  shortcut: string;
  tone: "primary" | "ghost";
  onClick: () => void;
  disabled: boolean;
}

function ActionButton({ label, shortcut, tone, onClick, disabled }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} (${shortcut})`}
      className={
        "bcc-mono inline-flex min-h-[36px] items-center gap-2 border-2 px-3 py-1.5 text-[11px] tracking-[0.18em] transition disabled:opacity-50 " +
        (tone === "primary"
          ? "border-ink bg-ink text-cardstock hover:bg-blueprint"
          : "border-cardstock-edge text-ink-soft hover:border-ink/50 hover:text-ink")
      }
    >
      <span>{label.toUpperCase()}</span>
      <kbd
        aria-hidden
        className="border border-current/30 px-1 text-[9px] opacity-70"
      >
        {shortcut}
      </kbd>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shortcut overlay — opened with `?`, dismissed with Escape or X
// ─────────────────────────────────────────────────────────────────────

interface ShortcutOverlayProps {
  onClose: () => void;
}

const SHORTCUT_TABLE: Array<{ keys: string; description: string }> = [
  { keys: "J / K", description: "Focus next / previous report" },
  { keys: "H",     description: "Hide focused report" },
  { keys: "D",     description: "Dismiss focused report" },
  { keys: "R",     description: "Restore focused report" },
  { keys: "/",     description: "Focus reporter-handle search" },
  { keys: "?",     description: "Open this shortcut sheet" },
  { keys: "Esc",   description: "Close this sheet" },
];

function ShortcutOverlay({ onClose }: ShortcutOverlayProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onClick={onClose}
    >
      <div
        className="bcc-panel relative flex w-full max-w-md flex-col gap-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="bcc-stencil text-2xl text-ink">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft hover:text-ink"
            aria-label="Close shortcut sheet"
          >
            CLOSE
          </button>
        </header>
        <ul className="flex flex-col divide-y divide-cardstock-edge/40">
          {SHORTCUT_TABLE.map((row) => (
            <li
              key={row.keys}
              className="flex items-center justify-between gap-3 py-2"
            >
              <kbd className="bcc-mono inline-flex min-w-[60px] justify-center rounded-sm border border-cardstock-edge bg-cardstock-deep/40 px-2 py-1 text-[11px] not-italic text-ink">
                {row.keys}
              </kbd>
              <span className="font-serif text-ink-soft">{row.description}</span>
            </li>
          ))}
        </ul>
        <p className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft/70">
          Letter shortcuts are suppressed while typing in inputs.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Error state — admin-forbidden vs everything else
// ─────────────────────────────────────────────────────────────────────

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
      <StatusTabs value={filter} onChange={onChange} />
      <p role="alert" className="bcc-mono mt-4 text-safety">
        Couldn&apos;t load reports: {error.message}
      </p>
    </div>
  );
}
