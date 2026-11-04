/**
 * /me/validator-pages — the multi-chain operator dashboard.
 *
 * Every validator page the signed-in member holds a VERIFIED operator
 * claim on, grouped by chain. An operator running validators on several
 * chains sees one row per claimed page, each linking to its own public
 * page with its own chain data and its own community.
 *
 * Server component, matching /me/progression and /me/reliability: the
 * payload is session-scoped and read once per render, so there is no
 * React Query hook (client re-fetching would race the server render for
 * no UX gain — the same reasoning as me-reliability-endpoints).
 *
 * Visibility: signed-in only. Anonymous viewers redirect to
 * `/login?callbackUrl=/me/validator-pages`.
 *
 * ⚠⚠ THIS PAGE RENDERS NO MEMBERSHIP BADGE, DELIBERATELY. The backend's
 * `chain_reported_status` is the last status a provider reported and
 * cannot establish whether a validator is in its chain's current active
 * set — `"inactive"` means PRESENT on Solana, where the fetcher merges
 * the delinquent list into the active one, and the value freezes
 * indefinitely for a validator the index fetch stops returning. So it is
 * shown under a "chain reported" label and never as "in the active set"
 * or "not in the current set". Contract §4 states the same constraint.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { humanizeCode } from "@/lib/api/errors";
import {
  getMeValidatorPages,
  type MeValidatorPageRow,
} from "@/lib/api/me-validator-pages-endpoints";

export default async function ValidatorPagesDashboard() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/me/validator-pages");
  }

  let rows: MeValidatorPageRow[] = [];
  let errorMessage: string | null = null;

  try {
    const payload = await getMeValidatorPages(session.bccToken);
    rows = payload.items;
  } catch (err) {
    // A failed read must not look like "you have claimed nothing" —
    // those two states say opposite things to an operator.
    errorMessage = humanizeCode(
      err,
      {
        bcc_unauthorized: "Your session expired. Sign in again to see your pages.",
        bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      },
      "Couldn't load your validator pages. Try again in a moment.",
    );
  }

  const groups = groupByChain(rows);

  return (
    <main className="pb-24">
      <div className="border-b border-dashed border-bcc-border">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
          <span className="bcc-mono inline-flex items-center gap-2 text-bcc-text-secondary">
            <span className="bcc-rail-dot" aria-hidden />
            <span>OPERATOR &nbsp;//&nbsp; VALIDATOR PAGES</span>
          </span>
          <span className="bcc-mono text-bcc-text-secondary">
            {rows.length} CLAIMED &nbsp;//&nbsp; {groups.length}{" "}
            {groups.length === 1 ? "CHAIN" : "CHAINS"}
          </span>
        </div>
      </div>

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-safety">YOUR PAGES</p>
        <h1
          className="bcc-stencil mt-3 text-bcc-text leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          Validator pages.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-bcc-text-secondary">
          Every validator you have proved you operate. Each page keeps its
          own chain data, its own URL, and its own community.
        </p>
      </header>

      <div className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-10">
        {errorMessage !== null ? (
          <p
            role="status"
            className="border border-dashed border-bcc-border px-5 py-6 font-serif text-bcc-text-secondary"
          >
            {errorMessage} Your claims are unaffected — this is a read
            problem, not a change to what you operate.
          </p>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-12">
            {groups.map((group) => (
              <ChainGroup key={group.key} label={group.label} rows={group.rows} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

interface ChainGroupData {
  key: string;
  label: string;
  rows: MeValidatorPageRow[];
}

/**
 * One group per chain, so a multi-chain operator reads their pages by
 * chain rather than as one undifferentiated list. Rows with no chain row
 * fall into a clearly-labelled group instead of being dropped.
 */
function groupByChain(rows: MeValidatorPageRow[]): ChainGroupData[] {
  const byKey = new Map<string, ChainGroupData>();

  for (const row of rows) {
    const key = row.chain.slug ?? "__unknown__";
    const label = row.chain.name ?? row.chain.slug ?? "Chain unavailable";
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { key, label, rows: [row] });
    } else {
      existing.rows.push(row);
    }
  }

  return [...byKey.values()];
}

function ChainGroup({ label, rows }: { label: string; rows: MeValidatorPageRow[] }) {
  return (
    <section>
      <h2 className="bcc-stencil text-2xl text-bcc-text">{label}</h2>
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((row) => (
          <li
            key={`${row.validator.id}`}
            className="border border-dashed border-bcc-border px-5 py-5"
          >
            <ValidatorRow row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ValidatorRow({ row }: { row: MeValidatorPageRow }) {
  const name = row.validator.moniker ?? shortenAddress(row.validator.operator_address);

  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <p className="font-serif text-lg text-bcc-text">{name}</p>
        <p className="bcc-mono mt-1 break-all text-sm text-bcc-text-secondary">
          {row.validator.operator_address}
        </p>
        <p className="bcc-mono mt-2 text-xs text-bcc-text-secondary">
          CLAIM {row.claim_status.toUpperCase()} &nbsp;//&nbsp; ROLE{" "}
          {row.claim_role.toUpperCase()}
        </p>
        {/* ⚠ Labelled as REPORTED, never as current set membership. */}
        <p className="bcc-mono mt-1 text-xs text-bcc-text-secondary">
          CHAIN REPORTED: {row.chain_reported_status.toUpperCase()}
        </p>
      </div>

      <div className="shrink-0">
        {row.page_slug !== null ? (
          <Link
            href={`/v/${row.page_slug}` as Route}
            className="bcc-mono inline-block border border-bcc-border px-4 py-2 text-sm text-bcc-text hover:border-safety"
          >
            VIEW PUBLIC PAGE
          </Link>
        ) : (
          <p className="bcc-mono max-w-xs text-xs text-bcc-text-secondary">
            YOUR CLAIM IS VERIFIED BUT THIS VALIDATOR HAS NO PUBLIC PAGE YET.
            NOTHING IS LOST — THE PAGE IS CREATED BY THE INDEXER.
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-bcc-border px-5 py-8">
      <p className="font-serif text-lg text-bcc-text">
        You have not claimed a validator page yet.
      </p>
      <p className="mt-3 max-w-2xl font-serif text-bcc-text-secondary">
        Find your validator in the directory and claim its page by signing a
        challenge with the operator wallet. Claiming one chain does not stop
        you claiming others — each validator is proved separately.
      </p>
      <Link
        href={"/directory?kind=validator" as Route}
        className="bcc-mono mt-5 inline-block border border-bcc-border px-4 py-2 text-sm text-bcc-text hover:border-safety"
      >
        BROWSE VALIDATORS
      </Link>
    </div>
  );
}

/** First and last 6 characters, for a row with no moniker. */
function shortenAddress(address: string): string {
  if (address.length <= 16) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}
