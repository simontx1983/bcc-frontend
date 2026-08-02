/**
 * Chain-scoped content panels for a Hall (§4.7) — the Validators and
 * NFT Collections tabs.
 *
 * WHY THESE EXIST. Halls are BCC's answer to the reputation cold-start
 * problem: nobody arrives to "build decentralised reputation", but they
 * will arrive to see who secures a chain. A reputation graph cannot be
 * seeded — that is the product's premise — but validator and collection
 * data is ALREADY indexed, so a Hall can be worth entering with zero
 * members. Before this, every Hall showed a chain badge, "1 member" and
 * an empty feed while 261 validators sat unshown behind it.
 *
 * Presentational only. The server ships a shaped, capped view-model
 * (6 per list, ordered by stake / holder count); these components decide
 * nothing about what qualifies — they format and link out.
 *
 * Each returns null when its list is empty, and the Hall page only passes
 * a panel when it has rows — so a chain with nothing indexed shows three
 * tabs rather than two empty rooms.
 */

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import type {
  HallCollectionPreview,
  HallValidatorPreview,
} from "@/lib/api/types";

/**
 * Compact stake display. `total_stake` arrives as a STRING because the
 * value exceeds float precision — parsing here is for display only and
 * never round-trips back to the server.
 */
function formatStake(raw: string | null): string | null {
  if (raw === null || raw === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

function initialOf(label: string): string {
  const trimmed = label.trim();
  return trimmed === "" ? "?" : trimmed.slice(0, 1).toUpperCase();
}

/** Shared square thumb: real logo when we have one, monogram when we don't. */
function Thumb({ src, label }: { src: string | null; label: string }) {
  if (src !== null) {
    return (
      <Image
        src={src}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-sm object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="bcc-mono flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-bcc-surface-raised text-bcc-text-secondary"
    >
      {initialOf(label)}
    </span>
  );
}

function PanelHeader({
  heading,
  href,
  linkLabel,
}: {
  heading: string;
  href: string | null;
  linkLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="bcc-stencil text-xl text-bcc-text">{heading}</h2>
      {href !== null && (
        <Link
          href={href as Route}
          className="bcc-mono shrink-0 text-xs text-bcc-text-secondary hover:underline"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

export interface HallValidatorsPanelProps {
  chain: string | null;
  validators: HallValidatorPreview[];
  /** Total on this chain, not the previewed count. */
  validatorCount: number;
}

export function HallValidatorsPanel({
  chain,
  validators,
  validatorCount,
}: HallValidatorsPanelProps) {
  if (validators.length === 0) {
    return null;
  }

  const chainLabel = chain !== null ? chain.toUpperCase() : "THIS CHAIN";

  return (
    <section className="bcc-panel flex flex-col gap-4 p-6">
      <PanelHeader
        heading={`Who secures ${chainLabel}`}
        href={chain !== null ? `/validators?chain=${encodeURIComponent(chain)}` : null}
        linkLabel={`All ${validatorCount.toLocaleString()} →`}
      />

      <ul className="flex flex-col gap-3">
        {validators.map((validator) => {
          const stake = formatStake(validator.total_stake);
          return (
            <li key={validator.id} className="flex items-center gap-3">
              <Thumb src={validator.logo_url} label={validator.moniker} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-serif text-bcc-text">
                  {validator.moniker === "" ? "Unnamed validator" : validator.moniker}
                </span>
                <span className="bcc-mono block text-xs text-bcc-text-secondary">
                  {[
                    stake !== null ? `${stake} staked` : null,
                    validator.delegator_count !== null
                      ? `${validator.delegator_count.toLocaleString()} delegators`
                      : null,
                  ]
                    .filter((part): part is string => part !== null)
                    .join(" · ")}
                </span>
              </span>
              {validator.voting_power_rank !== null && (
                <span className="bcc-mono shrink-0 text-xs text-bcc-text-secondary">
                  #{validator.voting_power_rank}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="font-serif text-sm text-bcc-text-secondary">
        Ranked by stake, not by endorsement. Size is not the same as
        trustworthiness — open a validator to see what people actually say.
      </p>
    </section>
  );
}

export interface HallCollectionsPanelProps {
  chain: string | null;
  collections: HallCollectionPreview[];
  /** Total on this chain, not the previewed count. */
  collectionCount: number;
}

export function HallCollectionsPanel({
  chain,
  collections,
  collectionCount,
}: HallCollectionsPanelProps) {
  if (collections.length === 0) {
    return null;
  }

  const chainLabel = chain !== null ? chain.toUpperCase() : "THIS CHAIN";

  return (
    <section className="bcc-panel flex flex-col gap-4 p-6">
      <PanelHeader
        heading={`Collections on ${chainLabel}`}
        href="/cards"
        linkLabel={`All ${collectionCount.toLocaleString()} →`}
      />

      <ul className="flex flex-col gap-3">
        {collections.map((collection) => (
          <li key={collection.id} className="flex items-center gap-3">
            <Thumb
              src={collection.image_url}
              label={collection.name ?? collection.contract_address}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-bcc-text">
                {collection.name ?? "Unnamed collection"}
              </span>
              <span className="bcc-mono block truncate text-xs text-bcc-text-secondary">
                {collection.contract_address}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="font-serif text-sm text-bcc-text-secondary">
        Verified collections indexed on this chain. Verification means the
        contract is confirmed — not that the project is endorsed.
      </p>
    </section>
  );
}
