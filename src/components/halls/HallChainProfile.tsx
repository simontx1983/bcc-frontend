/**
 * HallChainProfile — chain-identity + "About this chain" block for a Hall.
 * Lives inside the Hall's About tab (below the group's own About content);
 * the degraded no-tabs path renders it stacked (contract v1.73, additive).
 *
 * COMMUNITY / identity, NOT financial. `chain_profile` carries no price,
 * market-cap, or supply data and none is derived here — this renders the
 * operator-authored name, icon, native-token symbol, chain type, an optional
 * block-explorer link, and the "About this chain" prose. Nothing more.
 *
 * Renders NOTHING when `chainProfile` is `null`/`undefined` (a chainless Hall,
 * or a backend that predates the block), so the page is identical to today on
 * the old path. Every content field is independently nullable and each has a
 * graceful fallback: no icon → monogram (never a broken <img>); no
 * token / explorer / description → that row simply doesn't render.
 *
 * Server component — no state, effects, or browser APIs. The only transition
 * is CSS-gated behind `motion-safe:`, so reduced-motion viewers get a static
 * result without a client hook. Rendered once per Hall page (not in a list),
 * so no memo is needed.
 */

import Image from "next/image";

import type { ChainProfile } from "@/lib/api/types";

/**
 * Defensive accent guard. `color` is already hex-sanitized server-side, but we
 * revalidate before injecting: only a plain 3- or 6-digit hex passes, and the
 * result is ONLY ever used as an inline `style` value (borderColor / a swatch
 * color) — never concatenated into a `<style>` block or dangerouslySetInnerHTML.
 * Anything else (null, a CSS function, a `url(...)`, stray whitespace) collapses
 * to null → no accent applied.
 */
function safeAccentColor(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  return /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(raw) ? raw : null;
}

/**
 * Defensive external-URL guard for `explorer_url`. Only http(s) URLs pass, so
 * a stray `javascript:` / `data:` value can never reach an anchor `href`.
 */
function safeExternalUrl(raw: string | null): string | null {
  if (raw === null || raw === "") {
    return null;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? raw
      : null;
  } catch {
    return null;
  }
}

function monogram(label: string): string {
  const trimmed = label.trim();
  return trimmed === "" ? "?" : trimmed.slice(0, 1).toUpperCase();
}

export interface HallChainProfileProps {
  /** From `getHall().chain_profile`. Null/undefined → renders nothing. */
  chainProfile: ChainProfile | null | undefined;
  /**
   * Outer container classes. Defaults to the unified shell's 1440 gutter so
   * the hero aligns with the group shell on the happy path; the degraded path
   * passes its narrower column.
   */
  containerClassName?: string;
}

export function HallChainProfile({
  chainProfile,
  containerClassName = "mx-auto max-w-[1440px] px-4 sm:px-7",
}: HallChainProfileProps) {
  // Old-backend / chainless safety: nothing new renders when the block is
  // absent or null.
  if (chainProfile === null || chainProfile === undefined) {
    return null;
  }

  const accent = safeAccentColor(chainProfile.color);
  const explorer = safeExternalUrl(chainProfile.explorer_url);
  const iconUrl = chainProfile.icon_url;
  const nativeToken =
    chainProfile.native_token !== null && chainProfile.native_token !== ""
      ? chainProfile.native_token
      : null;
  const about =
    chainProfile.description !== null && chainProfile.description.trim() !== ""
      ? chainProfile.description
      : null;

  return (
    <section aria-labelledby="hall-chain-name" className={containerClassName}>
      <div
        className="bcc-panel flex flex-col gap-5 p-6"
        style={accent !== null ? { borderColor: accent } : undefined}
      >
        <div className="flex items-center gap-4">
          {iconUrl !== null ? (
            <Image
              src={iconUrl}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="bcc-stencil flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-bcc-surface-raised text-2xl text-bcc-text-secondary"
              style={accent !== null ? { color: accent } : undefined}
            >
              {monogram(chainProfile.name)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h2
              id="hall-chain-name"
              className="bcc-stencil truncate text-2xl text-bcc-text"
            >
              {chainProfile.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className="bcc-mono text-bcc-text-secondary"
                style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              >
                {chainProfile.chain_type.toUpperCase()}
              </span>
              {nativeToken !== null && (
                <span
                  className="bcc-mono rounded-sm border border-bcc-border px-2 py-0.5 text-bcc-text-secondary"
                  style={{
                    fontSize: "10px",
                    letterSpacing: "0.12em",
                    ...(accent !== null ? { borderColor: accent } : {}),
                  }}
                >
                  {nativeToken}
                </span>
              )}
            </div>
          </div>
        </div>

        {explorer !== null && (
          <a
            href={explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="bcc-mono self-start text-xs text-bcc-text-secondary hover:text-bcc-text hover:underline motion-safe:transition-colors"
          >
            Block explorer ↗
          </a>
        )}

        {about !== null && (
          <div className="flex flex-col gap-2">
            <h3
              className="bcc-mono text-bcc-text-secondary"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            >
              ABOUT THIS CHAIN
            </h3>
            <p className="whitespace-pre-line font-serif text-bcc-text-secondary">
              {about}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
