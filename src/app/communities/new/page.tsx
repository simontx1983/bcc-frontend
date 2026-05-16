"use client";

/**
 * /communities/new — create a plain peepso-group owned by the viewer.
 *
 * Client component (form-driven; mutation runs in the browser via
 * useCreatePlainGroupMutation). The shell looks like the /communities
 * surface so the create flow feels like a continuation of discovery
 * rather than a separate admin tool.
 *
 * V1 scope (per the create-flow spec):
 *   - Name (3–100 chars, required)
 *   - Description (≤2000 chars, optional)
 *   - Privacy (open | closed)
 *
 * Server-side rules the form intentionally does NOT replicate:
 *   - Rate limit (5/hour) — surfaced via `bcc_rate_limited` toast
 *   - Auth required — page redirects anon viewers via the SiteHeader
 *     middleware. If a session expires mid-form, the mutation returns
 *     401; we surface the message verbatim per §A2.
 *
 * On success:
 *   - Redirect to /communities (the new group will appear in the
 *     discovery list — sort key keeps it near the bottom until it
 *     accrues activity, which is the right default for a brand-new
 *     room with one member)
 *   - `router.refresh()` first so the server-rendered grid re-fetches
 *     with the new group in it
 */

import type { Route } from "next";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  useState,
} from "react";

import { useCreatePlainGroupMutation } from "@/hooks/useMyGroups";
import { COMMUNITY_CHAIN_CATALOG } from "@/lib/communities/chain-catalog";
import type { CommunityPrivacy } from "@/lib/api/types";

const NAME_MIN = 3;
const NAME_MAX = 100;
const DESCRIPTION_MAX = 2000;

const TRUST_THRESHOLDS: ReadonlyArray<25 | 50 | 75> = [25, 50, 75];

export default function CreateCommunityPage() {
  const router = useRouter();
  const mutation = useCreatePlainGroupMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<CommunityPrivacy>("open");
  const [trustMin, setTrustMin] = useState<25 | 50 | 75>(50);
  const [chain, setChain] = useState<string>("");
  const [clientError, setClientError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < NAME_MIN) {
      setClientError(`Community name must be at least ${NAME_MIN} characters.`);
      return;
    }
    if (trimmedName.length > NAME_MAX) {
      setClientError(`Community name must be ${NAME_MAX} characters or fewer.`);
      return;
    }
    if (description.length > DESCRIPTION_MAX) {
      setClientError(`Description must be ${DESCRIPTION_MAX} characters or fewer.`);
      return;
    }
    if (chain === "") {
      setClientError(
        "Pick a chain tag for your community. This locks at creation and can't be changed later."
      );
      return;
    }

    mutation.mutate(
      {
        name: trimmedName,
        description: description.trim(),
        privacy,
        // Trust threshold only travels when privacy === 'trust' so the
        // server doesn't have to nullify it for the other three modes.
        ...(privacy === "trust" ? { trust_min: trustMin } : {}),
        chain,
      },
      {
        // Auto-join is handled server-side (PeepSo's group ctor flips
        // the creator's `gm_user_status` to `member_owner`), so we
        // route the user straight into the new community's Group Floor
        // tab. The detail page reads its data fresh per-request, so no
        // router.refresh() is needed.
        onSuccess: (response) => {
          router.push(
            `/communities/${encodeURIComponent(response.slug)}` as Route,
          );
        },
      }
    );
  };

  // Server error (mutation.error) takes precedence over client-side
  // validation copy — once a submit hits the server, that's the
  // authoritative message.
  const errorMessage = mutation.error?.message ?? clientError;
  const isSubmitting = mutation.isPending;

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-2xl px-6 pt-12 sm:px-8">
        <Link
          href="/communities"
          className="bcc-mono inline-flex items-center gap-1 text-[10px] tracking-[0.24em] text-cardstock-deep hover:text-cardstock"
        >
          <span aria-hidden>←</span> BACK TO COMMUNITIES
        </Link>
        <h1 className="bcc-stencil mt-3 text-4xl text-cardstock md:text-5xl">
          Start a community
        </h1>
        <p className="mt-3 font-serif text-lg text-cardstock-deep">
          A room of your own on the floor. Pick a name, write the door sign,
          and decide who walks in. You can rename and edit later.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-2xl px-6 sm:px-8">
        <form
          onSubmit={handleSubmit}
          className="bcc-panel flex flex-col gap-6 bg-cardstock p-6 sm:p-8"
          noValidate
        >
          {/* Name */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="community-name"
              className="bcc-mono text-[10px] tracking-[0.24em] text-ink-soft"
            >
              NAME
            </label>
            <input
              id="community-name"
              type="text"
              required
              minLength={NAME_MIN}
              maxLength={NAME_MAX}
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="e.g. Akash Operators"
              className="bcc-mono bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint"
              disabled={isSubmitting}
            />
            <p className="bcc-mono text-[9px] tracking-[0.18em] text-ink-soft/70">
              {name.trim().length} / {NAME_MAX}
            </p>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="community-description"
              className="bcc-mono text-[10px] tracking-[0.24em] text-ink-soft"
            >
              DESCRIPTION · OPTIONAL
            </label>
            <textarea
              id="community-description"
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              rows={5}
              placeholder="What's this room for? Who should walk in?"
              className="bcc-mono bg-paper px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-soft/60 ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint"
              disabled={isSubmitting}
            />
            <p className="bcc-mono text-[9px] tracking-[0.18em] text-ink-soft/70">
              {description.length} / {DESCRIPTION_MAX}
            </p>
          </div>

          {/* Chain tag — REQUIRED + IMMUTABLE. The tooltip is the
              entire copy of the lock-in contract; the form rejects
              submit when chain is empty AND the server rejects with a
              clear 400 if it ever bypasses (defense in depth). */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="community-chain"
              className="bcc-mono flex flex-wrap items-center gap-2 text-[10px] tracking-[0.24em] text-ink-soft"
            >
              <span>CHAIN TAG</span>
              <span
                className="bcc-mono cursor-help rounded-sm border border-safety/40 px-1.5 py-0.5 text-[9px] tracking-[0.16em] text-safety"
                title="Chain tag locks at creation and can't be updated or changed later."
                aria-label="Chain tag locks at creation and can't be updated or changed later."
              >
                LOCKED AT CREATION
              </span>
            </label>
            <select
              id="community-chain"
              name="chain"
              required
              value={chain}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setChain(e.target.value)}
              disabled={isSubmitting}
              className="bcc-mono bg-paper px-3 py-2 text-sm text-ink ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint"
            >
              <option value="" disabled>
                Pick a chain…
              </option>
              {COMMUNITY_CHAIN_CATALOG.map((opt) => (
                <option key={opt.slug} value={opt.slug}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p
              className="bcc-mono text-[9px] tracking-[0.18em] text-ink-soft/70"
              title="Chain tag locks at creation and can't be updated or changed later."
            >
              ⚠ This choice is permanent. Hover the chip above for details.
            </p>
          </div>

          {/* Privacy — four options, mutually exclusive. Trust mode
              surfaces a sub-picker for the threshold (25/50/75). All
              four are IMMUTABLE after creation — server enforces
              privacy + trust_min lock at the meta layer. */}
          <fieldset className="flex flex-col gap-2">
            <legend className="bcc-mono text-[10px] tracking-[0.24em] text-ink-soft">
              PRIVACY · LOCKED AT CREATION
            </legend>

            <PrivacyOption
              value="open"
              label="OPEN"
              copy="Anyone signed in can join. Easiest to grow. Best for public-topic rooms."
              current={privacy}
              onSelect={setPrivacy}
              disabled={isSubmitting}
            />
            <PrivacyOption
              value="closed"
              label="CLOSED · APPROVAL REQUIRED"
              copy="Discoverable, but you approve each join request. Best for vetted rooms."
              current={privacy}
              onSelect={setPrivacy}
              disabled={isSubmitting}
            />
            <PrivacyOption
              value="secret"
              label="INVITE-ONLY"
              copy="Hidden from discovery. Only people you invite directly will see it. Best for private groups."
              current={privacy}
              onSelect={setPrivacy}
              disabled={isSubmitting}
            />
            <PrivacyOption
              value="trust"
              label="TRUST-GATED"
              copy="Anyone with the picked reputation score can join. Best for serious rooms."
              current={privacy}
              onSelect={setPrivacy}
              disabled={isSubmitting}
            />

            {privacy === "trust" && (
              <div className="ml-7 flex flex-col gap-2 border-l-2 border-blueprint/40 bg-blueprint/5 px-4 py-3">
                <label
                  htmlFor="trust-min"
                  className="bcc-mono text-[10px] tracking-[0.24em] text-ink-soft"
                >
                  MINIMUM TRUST SCORE
                </label>
                <select
                  id="trust-min"
                  value={trustMin}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setTrustMin(Number(e.target.value) as 25 | 50 | 75)
                  }
                  disabled={isSubmitting}
                  className="bcc-mono w-fit bg-paper px-3 py-2 text-sm text-ink ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint"
                >
                  {TRUST_THRESHOLDS.map((n) => (
                    <option key={n} value={n}>
                      {n}+
                    </option>
                  ))}
                </select>
                <p className="font-serif text-xs leading-relaxed text-ink-soft">
                  Only viewers whose reputation score is at or above
                  this threshold can join. Their score is checked at
                  the join moment — a viewer below the bar today can
                  earn their way in later.
                </p>
              </div>
            )}
          </fieldset>

          {/* Errors */}
          {errorMessage !== null && (
            <p
              role="alert"
              className="bcc-mono text-[11px] tracking-[0.14em] text-safety"
            >
              {errorMessage}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-cardstock-edge/40 pt-5">
            <Link
              href="/communities"
              className="bcc-mono rounded-sm px-4 py-2 text-[11px] tracking-[0.16em] text-ink-soft hover:text-ink"
            >
              CANCEL
            </Link>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                name.trim().length < NAME_MIN ||
                chain === ""
              }
              className="bcc-stencil inline-flex items-center gap-2 rounded-sm bg-safety px-5 py-3 text-sm tracking-[0.12em] text-cardstock transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-safety"
            >
              {isSubmitting ? "Creating…" : "Create community"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

/**
 * PrivacyOption — one radio row in the four-mode picker. Extracted
 * so the four labels stay consistent (border + checked-state ring,
 * mono label + serif copy) and the parent form reads as four short
 * calls rather than four long blocks.
 */
function PrivacyOption({
  value,
  label,
  copy,
  current,
  onSelect,
  disabled,
}: {
  value: CommunityPrivacy;
  label: string;
  copy: string;
  current: CommunityPrivacy;
  onSelect: (next: CommunityPrivacy) => void;
  disabled: boolean;
}) {
  return (
    <label className="bcc-mono flex cursor-pointer items-start gap-3 border border-cardstock-edge bg-paper px-3 py-3 ring-1 ring-cardstock-edge transition has-[:checked]:border-blueprint has-[:checked]:bg-blueprint/5">
      <input
        type="radio"
        name="privacy"
        value={value}
        checked={current === value}
        onChange={() => onSelect(value)}
        className="mt-0.5 accent-blueprint"
        disabled={disabled}
      />
      <span className="flex flex-col gap-1 text-ink">
        <span className="text-sm tracking-[0.14em]">{label}</span>
        <span className="font-serif text-xs leading-relaxed text-ink-soft">
          {copy}
        </span>
      </span>
    </label>
  );
}
