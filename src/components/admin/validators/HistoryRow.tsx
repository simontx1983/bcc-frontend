/**
 * HistoryRow — one validator ownership audit entry, shared by the global
 * Audit History and a page's own history.
 *
 * Evidence renders through Evidence.tsx (text only, Copy for the ref,
 * security D5). A null subject is a deleted account; a null actor is a
 * system event. The reason shows the server's `reason_label`, never the
 * key.
 */

import { AdminField } from "@/components/admin/validators/AdminField";
import { AdminUserChip } from "@/components/admin/validators/AdminUserChip";
import { EvidenceNote, EvidenceRef } from "@/components/admin/validators/Evidence";
import {
  ACTION_LABEL,
  SNAPSHOT_METHOD_LABEL,
  STEP_UP_LABEL,
  labelFor,
} from "@/components/admin/validators/labels";
import type {
  ValidatorRelationshipHistoryItem,
  ValidatorRelationshipSnapshot,
} from "@/lib/api/types";
import { formatAbsoluteDateTime } from "@/lib/format";

/** The subject's account no longer exists (e.g. after `account_deleted`). */
export const DELETED_ACCOUNT_COPY = "Deleted account";
/** No person acted: the re-verify sweep, an expired step-up or invite, a wallet-proof supersede. */
export const SYSTEM_ACTOR_COPY = "System";

function present(value: string | null): string {
  return value === null || value === "" ? "—" : value;
}

function ChangeLine({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <span className="bcc-mono w-16 shrink-0 text-[10px] tracking-[0.16em] text-bcc-text-secondary">
        {label}
      </span>
      <span className="bcc-mono break-all text-[11px] text-bcc-text">
        {before} → {after}
      </span>
    </li>
  );
}

function methodText(snapshot: ValidatorRelationshipSnapshot): string {
  return snapshot.method === null ? "—" : labelFor(SNAPSHOT_METHOD_LABEL, snapshot.method);
}

export interface HistoryRowProps {
  item: ValidatorRelationshipHistoryItem;
  onCopyRef: (ref: string) => void;
}

export function HistoryRow({ item, onCopyRef }: HistoryRowProps) {
  const when = formatAbsoluteDateTime(item.created_at);
  const note = item.evidence_note ?? "";
  const ref = item.evidence_ref ?? "";
  // The server's label; the raw key only if an older server sent no label.
  const reason = item.reason_label ?? item.reason ?? "";

  return (
    <li className="bcc-panel flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="bcc-mono inline-flex shrink-0 items-center rounded-sm border border-bcc-border px-2 py-0.5 text-[10px] tracking-[0.18em] text-bcc-text">
            {labelFor(ACTION_LABEL, item.action).toUpperCase()}
          </span>
          <span className="bcc-stencil min-w-0 break-words text-lg text-bcc-text">
            {item.page.title}
          </span>
          <span className="bcc-mono text-[10px] text-bcc-text-secondary">
            page #{item.page.page_id}
          </span>
        </div>
        <time
          dateTime={item.created_at}
          className="bcc-mono text-[10px] text-bcc-text-secondary"
        >
          {when !== "" ? when : item.created_at}
        </time>
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <AdminField label="Subject">
          {item.subject === null ? (
            <span className="text-bcc-text-secondary">{DELETED_ACCOUNT_COPY}</span>
          ) : (
            <AdminUserChip user={item.subject} size="xs" />
          )}
        </AdminField>
        <AdminField label="Actor">
          {item.actor === null ? (
            <span className="text-bcc-text-secondary">{SYSTEM_ACTOR_COPY}</span>
          ) : (
            <AdminUserChip user={item.actor} size="xs" />
          )}
        </AdminField>
        <AdminField label="Before → after">
          <ul className="flex flex-col gap-0.5">
            <ChangeLine label="ROLE" before={present(item.prev.role)} after={present(item.new.role)} />
            <ChangeLine
              label="STATUS"
              before={present(item.prev.status)}
              after={present(item.new.status)}
            />
            <ChangeLine label="METHOD" before={methodText(item.prev)} after={methodText(item.new)} />
          </ul>
        </AdminField>
        <AdminField label="Step-up">
          {item.step_up === null ? "None" : labelFor(STEP_UP_LABEL, item.step_up)}
        </AdminField>
        {reason !== "" && (
          <AdminField label="Reason" wide>
            <span className="break-words">{reason}</span>
          </AdminField>
        )}
        {note !== "" && (
          <AdminField label="Evidence note" wide>
            <EvidenceNote note={note} />
          </AdminField>
        )}
        {ref !== "" && (
          <AdminField label="Evidence reference" wide>
            <EvidenceRef
              value={ref}
              copyLabel={`Copy evidence reference for entry #${item.id}`}
              onCopy={() => onCopyRef(ref)}
            />
          </AdminField>
        )}
      </dl>
    </li>
  );
}
