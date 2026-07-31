/**
 * Chain-scoped content preview for a Hall (§4.7).
 *
 * WHY THIS EXISTS. Halls are BCC's answer to the reputation cold-start
 * problem: nobody arrives to "build decentralised reputation", but they
 * will arrive to see who secures a chain. A reputation graph cannot be
 * seeded — that is the product's premise — but validator and collection
 * data is ALREADY indexed, so a Hall can be worth entering with zero
 * members. Before this, every Hall rendered a chain badge, "1 member"
 * and an empty feed while 261 validators sat unshown behind it.
 *
 * Presentational only. The server ships a shaped, capped view-model
 * (6 per list, ordered by stake / holder count); this component decides
 * nothing about what qualifies — it formats and links out.
 */

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import type {
  HallCollectionPreview,
  HallValidatorPreview,
} from "@/lib/api/types";

interface HallChainContentProps {
  chain: string | null;
  validators: HallValidatorPreview[];
  collections: HallCollectionPreview[];
  validatorCount: number;
  collectionCount: number;
}

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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="bcc-stencil text-xl text-bcc-text">{children}</h2>;
}

export function HallChainContent({
  chain,
  validators,
  collections,
  validatorCount,
  collectionCount,
}: HallChainContentProps) {
  // Nothing indexed for this chain (or no chain at all) — render nothing
  // rather than an empty-state that draws attention to the absence.
  if (validators.length === 0 && collections.length === 0) {
    return null;
  }

  const chainLabel = chain !== null ? chain.toUpperCase() : "THIS CHAIN";

  return (
    <div className="flex flex-col gap-4">
      {validators.length > 0 && (
        <section className="bcc-panel flex flex-col gap-4 p-6">
          <div className="flex items-baseline justify-between gap-3">
            <SectionHeading>Who secures {chainLabel}</SectionHeading>
            {chain !== null && (
              <Link
                href={`/validators?chain=${encodeURIComponent(chain)}` as Route}
                className="bcc-mono shrink-0 text-xs text-bcc-text-secondary hover:underline"
              >
                All {validatorCount} →
              </Link>
            )}
          </div>

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
      )}

      {collections.length > 0 && (
        <section className="bcc-panel flex flex-col gap-4 p-6">
          <div className="flex items-baseline justify-between gap-3">
            <SectionHeading>Collections on {chainLabel}</SectionHeading>
            <Link
              href={"/cards" as Route}
              className="bcc-mono shrink-0 text-xs text-bcc-text-secondary hover:underline"
            >
              All {collectionCount} →
            </Link>
          </div>

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
        </section>
      )}
    </div>
  );
}
