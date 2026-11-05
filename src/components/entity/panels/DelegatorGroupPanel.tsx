"use client";

/**
 * DelegatorGroupPanel — the validator page's delegator-group surface,
 * rendered from `card.delegator_group`. A page has at most one group.
 *
 * All of it is the server's call:
 *
 *   group present      → link to the group, with its minimum
 *   can_edit_min_stake → "Edit minimum" + dialog
 *   can_create         → "Create delegator group" + dialog
 *   unavailable_reason → the server's explanation, verbatim
 *   none of those      → nothing (a visitor on a supported chain with no
 *                        group yet has nothing to act on, and a "coming
 *                        soon" here would promise what nobody has chosen)
 *
 * A group is only ever created by the operator pressing the button.
 *
 * Client-side checks in the dialogs are UX. The server validates `min_stake`
 * and re-resolves operator authority on every write, so a stale button can
 * only earn a refusal, which is then shown plainly.
 */

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import {
  useCreateDelegatorGroupMutation,
  useUpdateDelegatorGroupMutation,
} from "@/hooks/useValidatorGroups";
import { humanizeCode, isCode } from "@/lib/api/errors";
import type {
  BccApiError,
  DelegatorGroup,
  DelegatorGroupBlock,
  DelegatorGroupOption,
} from "@/lib/api/types";

const DEFAULT_MIN_STAKE = "1";

const ACTION_CLASS =
  "bcc-mono inline-flex items-center justify-center rounded-sm border border-bcc-border bg-bcc-surface-raised px-4 py-2 text-bcc-text transition motion-reduce:transition-none hover:border-bcc-border-strong disabled:cursor-not-allowed disabled:opacity-50";
const ACTION_STYLE = { minHeight: "44px", fontSize: "12px" } as const;

const INVALID_MIN_STAKE_COPY =
  "Enter the minimum as a plain positive number: up to 6 decimal places, no more than 1,000,000,000.";

/** Only the authority refusal carries a reason code; a suspension has none. */
function forbiddenCopy(error: BccApiError | null): string {
  return error?.data?.["reason_code"] !== undefined
    ? "You're not the verified operator of this validator any more."
    : "Your account is suspended, so you can't make this change.";
}

export function DelegatorGroupPanel({
  pageId,
  pageName,
  block,
}: {
  pageId: number;
  /** Names the validator in the create form if an option has no `name`. */
  pageName: string;
  block: DelegatorGroupBlock;
}) {
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  // A write's response (or a conflict's `data.group`) is server truth too.
  // Holding it means the panel is right straight away, not after
  // router.refresh() lands; the refreshed card then replaces it.
  const [knownGroup, setKnownGroup] = useState<DelegatorGroup | null>(null);
  useEffect(() => {
    setKnownGroup(null);
  }, [block.group]);

  const group = knownGroup ?? block.group;
  const canCreate = group === null && block.can_create && block.options.length > 0;
  const canEdit = group !== null && block.can_edit_min_stake;
  const reason = block.unavailable_reason;

  if (group === null && !canCreate && reason === null) return null;

  return (
    <section
      aria-label="Delegator group"
      className="mx-auto mt-8 max-w-[1440px] px-4 sm:px-7"
    >
      <div className="bcc-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0" style={{ maxWidth: "60ch" }}>
          <h2 className="bcc-stencil text-bcc-text" style={{ fontSize: "20px" }}>
            Delegator group
          </h2>
          {group?.validator != null && (
            <p className="mt-1 font-serif text-bcc-text">
              For {group.validator.name} on {group.validator.chain_name}
            </p>
          )}
          {group?.min_stake_display != null && (
            <p className="mt-1 font-serif text-bcc-text">
              Minimum delegation: {group.min_stake_display}
            </p>
          )}
          {canCreate && (
            <p className="mt-1 font-serif text-bcc-text-secondary">
              No delegator group yet. If you create one, you set the minimum
              delegation, and people join only after it&rsquo;s verified on chain.
            </p>
          )}
          {reason !== null && (
            <p className="mt-1 font-serif text-bcc-text-secondary">{reason}</p>
          )}
        </div>

        {(group !== null || canCreate) && (
          <div className="flex flex-wrap items-center gap-2">
            {group !== null && (
              <Link href={group.url as Route} className={ACTION_CLASS} style={ACTION_STYLE}>
                VIEW DELEGATOR GROUP
              </Link>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setDialog("edit")}
                className={ACTION_CLASS}
                style={ACTION_STYLE}
              >
                EDIT MINIMUM
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => setDialog("create")}
                className={ACTION_CLASS}
                style={ACTION_STYLE}
              >
                CREATE DELEGATOR GROUP
              </button>
            )}
          </div>
        )}
      </div>

      {/* Keyed to the dialog state, not to the branches above: a 409 flips
          the panel to the link while the dialog is still explaining why. */}
      {dialog === "create" && (
        <CreateDialog
          pageId={pageId}
          pageName={pageName}
          options={block.options}
          onGroupKnown={setKnownGroup}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "edit" && group !== null && (
        <EditDialog
          pageId={pageId}
          group={group}
          onGroupKnown={setKnownGroup}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function CreateDialog({
  pageId,
  pageName,
  options,
  onGroupKnown,
  onClose,
}: {
  pageId: number;
  pageName: string;
  options: DelegatorGroupOption[];
  onGroupKnown: (group: DelegatorGroup) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const pickerId = useId();
  const [validatorId, setValidatorId] = useState(options[0]?.validator_id ?? 0);
  const selected =
    options.find((option) => option.validator_id === validatorId) ?? options[0];

  const mutation = useCreateDelegatorGroupMutation({
    onSuccess: (data) => {
      onGroupKnown(data.group);
      onClose();
      router.refresh();
    },
    onError: (err) => {
      const existing = conflictGroup(err);
      if (existing !== null) onGroupKnown(existing);
    },
  });
  const error = mutation.error;
  const existing = error !== null ? conflictGroup(error) : null;
  const terminal = isCode(error, "bcc_conflict") || isCode(error, "bcc_forbidden");
  const chainName = selected?.chain_name ?? "this chain";
  const validatorName = selected?.name ?? pageName;
  const token = selected?.native_token ?? null;

  return (
    <MinStakeDialog
      title="Create delegator group"
      submitLabel="CREATE GROUP"
      pendingLabel="CREATING…"
      fieldLabel={`MINIMUM DELEGATION${token !== null ? ` (${token.toUpperCase()})` : ""}`}
      initialValue={DEFAULT_MIN_STAKE}
      help="People join only after we verify they currently delegate at least this much. You can change it later."
      pending={mutation.isPending}
      error={error}
      errorCopy={humanizeCode(
        error,
        {
          bcc_unauthorized: "Sign in again to create this group.",
          bcc_forbidden: forbiddenCopy(error),
          bcc_not_found: "This validator isn't linked to this page any more.",
          bcc_invalid_request: INVALID_MIN_STAKE_COPY,
          bcc_delegator_group_unavailable: `Delegator groups aren't available on ${chainName} yet.`,
          bcc_conflict: "This page already has a delegator group.",
          bcc_rate_limited: "Creating too fast — give it a moment and try again.",
          bcc_internal_error: "The group couldn't be saved just now. Try again in a moment.",
        },
        "Couldn't create this group. Try again in a moment.",
      )}
      errorLink={existing !== null ? { url: existing.url, label: "View the group" } : null}
      terminal={terminal}
      onClose={onClose}
      onEdit={() => {
        if (error !== null) mutation.reset();
      }}
      onSubmit={(minStake) => {
        if (selected === undefined) return;
        mutation.mutate({
          pageId,
          request: { validator_id: selected.validator_id, min_stake: minStake },
        });
      }}
    >
      {/* Only on the rare page bound to several validators. One group per
          page, so this choice decides whose delegators it verifies. */}
      {options.length > 1 ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={pickerId}
            className="bcc-mono text-bcc-text-secondary"
            style={{ fontSize: "11px" }}
          >
            VALIDATOR AND CHAIN
          </label>
          <select
            id={pickerId}
            value={validatorId}
            onChange={(e) => {
              setValidatorId(Number(e.target.value));
              if (error !== null) mutation.reset();
            }}
            disabled={mutation.isPending || terminal}
            className="rounded-sm border border-bcc-border bg-bcc-input-bg px-3 py-2 text-bcc-text disabled:opacity-50"
            style={{ minHeight: "44px" }}
          >
            {options.map((option) => (
              <option key={option.validator_id} value={option.validator_id}>
                {option.name ?? pageName} on {option.chain_name}
              </option>
            ))}
          </select>
          <p className="text-bcc-text-secondary" style={{ fontSize: "12px" }}>
            A page has one delegator group. Pick the validator whose delegators
            it verifies.
          </p>
        </div>
      ) : (
        <p className="font-serif text-bcc-text-secondary">
          For delegators of {validatorName} on {chainName}.
        </p>
      )}
    </MinStakeDialog>
  );
}

function EditDialog({
  pageId,
  group,
  onGroupKnown,
  onClose,
}: {
  pageId: number;
  group: DelegatorGroup;
  onGroupKnown: (group: DelegatorGroup) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const mutation = useUpdateDelegatorGroupMutation({
    onSuccess: (data) => {
      onGroupKnown(data.group);
      onClose();
      router.refresh();
    },
  });
  const error = mutation.error;
  const terminal = isCode(error, "bcc_not_found") || isCode(error, "bcc_forbidden");

  return (
    <MinStakeDialog
      title="Edit minimum delegation"
      submitLabel="SAVE MINIMUM"
      pendingLabel="SAVING…"
      fieldLabel="NEW MINIMUM DELEGATION"
      initialValue={group.min_stake}
      help={
        group.min_stake_display !== null
          ? `The minimum is ${group.min_stake_display} now.`
          : null
      }
      pending={mutation.isPending}
      error={error}
      errorCopy={humanizeCode(
        error,
        {
          bcc_unauthorized: "Sign in again to change the minimum.",
          bcc_forbidden: forbiddenCopy(error),
          bcc_not_found: "This page doesn't have a delegator group any more.",
          bcc_invalid_request: INVALID_MIN_STAKE_COPY,
          bcc_rate_limited: "Saving too fast — give it a moment and try again.",
          bcc_internal_error: "The minimum couldn't be saved just now. Try again in a moment.",
        },
        "Couldn't change the minimum. Try again in a moment.",
      )}
      errorLink={null}
      terminal={terminal}
      onClose={onClose}
      onEdit={() => {
        if (error !== null) mutation.reset();
      }}
      onSubmit={(minStake) => {
        mutation.mutate({ pageId, request: { min_stake: minStake } });
      }}
    >
      <div
        className="rounded-sm border border-dashed border-bcc-border px-3 py-2"
        data-testid="delegator-minimum-consequence"
      >
        <p className="font-serif text-bcc-text">
          If you raise the minimum, members below it are removed by automatic
          checks. These run twice a day in batches, so it can take several runs,
          and days for large groups. Removed members are told in the app, unless
          they&rsquo;ve turned that notice off, and can rejoin once they delegate
          enough.
        </p>
        <p className="mt-2 font-serif text-bcc-text">
          Lowering it removes nobody.
        </p>
      </div>
    </MinStakeDialog>
  );
}

/** The form both dialogs share. `children` sits above the minimum field. */
function MinStakeDialog({
  title,
  submitLabel,
  pendingLabel,
  fieldLabel,
  initialValue,
  help,
  pending,
  error,
  errorCopy,
  errorLink,
  terminal,
  onClose,
  onEdit,
  onSubmit,
  children,
}: {
  title: string;
  submitLabel: string;
  pendingLabel: string;
  fieldLabel: string;
  initialValue: string;
  help: string | null;
  pending: boolean;
  error: BccApiError | null;
  errorCopy: string;
  errorLink: { url: string; label: string } | null;
  /** Repeating the write can't help: the group exists, or authority is gone. */
  terminal: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSubmit: (minStake: string) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const inputId = useId();
  const helpId = useId();
  const [minStake, setMinStake] = useState(initialValue);
  const trimmed = minStake.trim();

  function close() {
    // ESC and the backdrop reach here too, so the hold lives here.
    if (pending) return;
    onClose();
    // The page's card is out of date after a terminal refusal. It's re-read
    // on close, not before, which would pull this explanation away mid-read.
    if (terminal) router.refresh();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || terminal || trimmed === "") return;
    onSubmit(trimmed);
  }

  return (
    <Dialog
      title={title}
      onClose={close}
      closeDisabled={pending}
      panelClassName="max-w-lg max-h-[92vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="bcc-stencil text-bcc-text" style={{ fontSize: "24px" }}>
          {title}
        </h2>

        {children}

        <div className="flex flex-col gap-1">
          <label
            htmlFor={inputId}
            className="bcc-mono text-bcc-text-secondary"
            style={{ fontSize: "11px" }}
          >
            {fieldLabel}
          </label>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={minStake}
            onChange={(e) => {
              setMinStake(e.target.value);
              onEdit();
            }}
            disabled={pending || terminal}
            aria-describedby={help !== null ? helpId : undefined}
            aria-invalid={isCode(error, "bcc_invalid_request")}
            className="rounded-sm border border-bcc-border bg-bcc-input-bg px-3 py-2 text-bcc-text disabled:opacity-50"
          />
          {help !== null && (
            <p id={helpId} className="text-bcc-text-secondary" style={{ fontSize: "12px" }}>
              {help}
            </p>
          )}
        </div>

        {error !== null && (
          <p role="alert" className="text-bcc-danger" style={{ fontSize: "13px" }}>
            {errorCopy}
            {errorLink !== null && (
              <>
                {" "}
                <Link href={errorLink.url as Route} className="underline">
                  {errorLink.label}
                </Link>
              </>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="bcc-mono rounded-sm border border-bcc-border px-4 py-2 text-bcc-text-secondary disabled:opacity-50"
            style={ACTION_STYLE}
          >
            {terminal ? "CLOSE" : "CANCEL"}
          </button>
          {!terminal && (
            <button
              type="submit"
              disabled={pending || trimmed === ""}
              className={ACTION_CLASS}
              style={ACTION_STYLE}
            >
              {pending ? pendingLabel : submitLabel}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/** The group a 409 describes in `data.group`, when it's usable. */
function conflictGroup(err: BccApiError): DelegatorGroup | null {
  if (err.code !== "bcc_conflict") return null;
  const group = err.data?.["group"];
  return isDelegatorGroup(group) ? group : null;
}

function isDelegatorGroup(value: unknown): value is DelegatorGroup {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    "slug" in value &&
    typeof value.slug === "string" &&
    "url" in value &&
    typeof value.url === "string" &&
    "min_stake" in value &&
    typeof value.min_stake === "string" &&
    "min_stake_display" in value &&
    (typeof value.min_stake_display === "string" || value.min_stake_display === null)
  );
}
