"use client";

/**
 * ValidatorPageAdmin — the admin view of one validator page (validator
 * admin V1, PR B): the header, the owner panel (link / revoke / cancel
 * behind the step-up), and the page's own history.
 *
 * Everything shown is server-decided: the state, the owner, the staff
 * lock, whether a link is cancellable, and the revoke reasons. A failed
 * read renders the shared admin panels — 403 "Admin access required",
 * 404 rest_no_route "not available yet", 404 bcc_not_found "no page
 * matches", anything else a real Retry.
 */

import { useId, useState } from "react";

import { AdminField } from "@/components/admin/validators/AdminField";
import { AdminReadFailure } from "@/components/admin/validators/AdminReadFailure";
import { HistoryList } from "@/components/admin/validators/HistoryList";
import { OwnerNotice, type OwnerPanelNotice } from "@/components/admin/validators/OwnerNotice";
import { OwnerPanel } from "@/components/admin/validators/OwnerPanel";
import { LockedMarker, lockedForStaff, StatePill } from "@/components/admin/validators/StatePill";
import { SKELETON_CLASS } from "@/components/ui/Skeleton";
import {
  useAdminValidatorPage,
  useAdminValidatorPageHistory,
} from "@/hooks/useAdminValidators";
import type { AdminValidatorPageRelationships } from "@/lib/api/types";

const SUBJECT = "This validator page";
const HISTORY_SUBJECT = "This page's history";

export function ValidatorPageAdmin({ pageId }: { pageId: number }) {
  const query = useAdminValidatorPage(pageId);
  const [notice, setNotice] = useState<OwnerPanelNotice | null>(null);

  if (query.isPending) {
    return (
      <div>
        <p role="status" className="sr-only">
          Loading the validator page…
        </p>
        <div aria-hidden className="flex flex-col gap-4">
          <div className={SKELETON_CLASS + " h-28"} />
          <div className={SKELETON_CLASS + " h-64"} />
        </div>
      </div>
    );
  }

  // No data to show beside a failure: the panel replaces the page.
  if (query.isLoadingError) {
    return (
      <AdminReadFailure error={query.error} subject={SUBJECT} onRetry={() => void query.refetch()} />
    );
  }

  const data = query.data;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader data={data} />
      {query.isRefetchError && (
        <AdminReadFailure error={query.error} subject={SUBJECT} onRetry={() => void query.refetch()} />
      )}
      <OwnerNotice notice={notice} />
      <OwnerPanel data={data} onNotice={setNotice} />
      <PageHistory pageId={pageId} />
    </div>
  );
}

function PageHeader({ data }: { data: AdminValidatorPageRelationships }) {
  return (
    <section aria-label="Validator page" className="bcc-panel flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="bcc-stencil min-w-0 break-words text-2xl text-bcc-text">{data.page.title}</h2>
        <span className="flex flex-wrap items-center gap-2">
          {lockedForStaff(data.owner) && <LockedMarker />}
          <StatePill state={data.state} />
        </span>
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <AdminField label="Chain">{data.page.chain.name}</AdminField>
        <AdminField label="Page id">
          <span className="bcc-mono">#{data.page.page_id}</span>
        </AdminField>
      </dl>
    </section>
  );
}

function PageHistory({ pageId }: { pageId: number }) {
  const query = useAdminValidatorPageHistory(pageId);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2
        id={headingId}
        className="bcc-mono mt-4 text-[10px] tracking-[0.24em] text-bcc-text-secondary"
      >
        HISTORY
      </h2>
      <HistoryList
        query={query}
        subject={HISTORY_SUBJECT}
        empty={{
          eyebrow: "NO HISTORY YET",
          heading: "No ownership changes yet.",
          body: "Links, revokes and cancellations on this page show up here, newest first.",
        }}
      />
    </section>
  );
}
