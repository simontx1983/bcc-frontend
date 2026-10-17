"use client";

/**
 * Report control for a single announcement.
 *
 * REUSES the shared content-report modal (`components/feed/ReportButton`)
 * rather than mirroring it. The §K1 reason taxonomy, the 500-character cap,
 * the comment-required-on-`other` rule, the created/existing handling and
 * the error copy all live there and are deliberately NOT restated here —
 * `ReportMemberModal` already mirrors that modal once, and a second mirror
 * would make three copies of one taxonomy to keep in step.
 *
 * ⚠ This is not a reaction, and must never grow into one. There is no
 * count, no toggle, no optimistic state and no "you reported this" badge:
 * a report is a private message to moderators, not a public signal. It does
 * not change any score, and it does not hide the notice — the server's
 * auto-hide path is disabled for announcements, so a reported notice stays
 * exactly as published.
 */

import { useState } from "react";

import { ReportModal } from "@/components/feed/ReportButton";
import type { AnnouncementCapabilities } from "@/lib/api/types";

/**
 * The announcement id, as `target_id` must be sent: a BARE INTEGER.
 *
 * View-model ids are prefixed (`ann_3731`); `target_id` is a bare numeric
 * body field, pinned in contract §4.32.4. The server's argument schema
 * rejects the prefixed string outright with `rest_invalid_param` before the
 * handler runs, so stripping here is not a convenience — the prefixed form
 * simply cannot be accepted. (That refusal is also what makes a report
 * against the WRONG row structurally unavailable rather than merely
 * unlikely: there is no coercion step that could turn `ann_3731` into 0.)
 *
 * Returns 0 when no usable positive integer can be recovered, mirroring
 * `resolveTargetId`'s contract in ReportButton.tsx so the gate can reject
 * on it rather than sending a malformed body.
 */
export function announcementTargetId(id: string | number): number {
  if (typeof id === "number") {
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
  }
  const bare = id.startsWith("ann_") ? id.slice("ann_".length) : id;
  // Anchored and digits-only: `parseInt` alone would accept "3731abc".
  if (!/^\d+$/.test(bare)) return 0;
  const parsed = Number.parseInt(bare, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

/** The minimum an announcement must carry to be reportable. */
export interface ReportableAnnouncement {
  id: string;
  title: string;
  capabilities?: AnnouncementCapabilities;
}

/**
 * Whether to offer the control at all.
 *
 * Reads the server's `allowed` and NOTHING else — never `reason_code`,
 * never an inference about who wrote the notice. Two consequences worth
 * stating, because both are load-bearing:
 *
 *   • An ABSENT capability is a denial. Public list rows carry no
 *     capabilities for any viewer (two distinct producers, by design), so
 *     they never show this control. They link to detail instead, where the
 *     server does supply a capability — the same reasoning the panel uses
 *     for omitting a pin control on an uncovered row. We do not guess, and
 *     we do not fetch a detail request per row to find out.
 *   • Because the gate ignores `reason_code`, the server's denial
 *     inventory can grow (`own_content`, and whatever follows) without a
 *     frontend change.
 */
export function canReportAnnouncement(announcement: ReportableAnnouncement): boolean {
  return (
    announcement.capabilities?.can_report?.allowed === true &&
    announcementTargetId(announcement.id) !== 0
  );
}

interface AnnouncementReportControlProps {
  announcement: ReportableAnnouncement;
  /**
   * Which colour family the host surface uses. The two must not be crossed:
   * list rows are fixed cream/ink paper (`text-ink*`), the detail page is
   * the theme-aware panel (`text-bcc-*`).
   */
  surface?: "panel" | "paper";
}

export function AnnouncementReportControl({
  announcement,
  surface = "panel",
}: AnnouncementReportControlProps) {
  const [open, setOpen] = useState(false);

  // After the hook, so the hook order is stable whether or not the viewer
  // may report.
  if (!canReportAnnouncement(announcement)) return null;

  const targetId = announcementTargetId(announcement.id);
  const tone =
    surface === "paper"
      ? "border-cardstock-edge text-ink"
      : "border-bcc-border text-bcc-text";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`bcc-mono rounded-sm border px-3 py-2 ${tone}`}
        style={{ minHeight: "44px", fontSize: "11px" }}
        /* The visible word is "REPORT", which is ambiguous when several
           rows are on screen. The accessible name names the notice. */
        aria-label={`Report ${announcement.title}`}
        data-testid="announcement-report-trigger"
      >
        REPORT
      </button>

      {open && (
        <ReportModal
          targetKind="announcement"
          targetId={targetId}
          subjectLabel="announcement"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
