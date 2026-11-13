"use client";

/**
 * EditAboutForm — the Edit About cards (Figma "Handoff v1", dev notes
 * 39–41), in the About page's order: YOUR BIO, VERIFICATIONS, HALLS,
 * OPERATOR / PROJECTS, BLOGS, REVIEWS. Each card carries a SHOW ON PROFILE
 * pill bound to one `/me/profile-prefs` field (absent on the wire = shown).
 *
 * ## Staging
 *
 * Every edit is staged and nothing is written until SAVE CHANGES. The
 * staged buffer holds ONLY what the member changed — `overrides` (pref key
 * → staged value) and `bioDraft` (null = untouched) — and every displayed
 * value is `staged ?? server`. Server state itself stays in React Query
 * (prefs) and the page's server props (bio); it is never copied into state.
 * The one exception is `savedBio`: the bio the server confirmed on our last
 * save, held because the `bio` prop only catches up after router.refresh().
 *
 * Save PATCHes only what differs from the server: changed prefs in one
 * `/me/profile-prefs` call, the bio through `/me/profile` only when it
 * changed. Save stays disabled until something differs; Cancel drops the
 * staged buffer.
 *
 * ## Deliberately absent (not on the backend yet)
 *
 * DETAILS (location/trade/website), per-Hall hide, claimed validators and
 * nodes with Pending / Remove, + ADD A NODE (no nodes search page exists),
 * and replying to reviews. Each has a marked slot below.
 *
 * Unsaved-changes guard: a `beforeunload` prompt only. The settings
 * dirty-guard (useSettingsDirtyGuard) intercepts the profile's tab
 * switches, and a standalone page has no single navigation choke point to
 * hand it.
 */

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { AboutSeeAll } from "@/components/profile/about/AboutCard";
import { MembershipRows } from "@/components/profile/about/AboutSections";
import { SettingsSaveStatus, saveStatusFrom } from "@/components/settings/SettingsSaveStatus";
import { humanizeBioError } from "@/components/settings/profile/BioEditor";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { MY_PRIVACY_QUERY_KEY } from "@/hooks/useMyPrivacy";
import { useProfilePrefs, useUpdateProfilePrefs } from "@/hooks/useProfilePrefs";
import { useUpdateBio } from "@/hooks/useUpdateProfile";
import { humanizeCode } from "@/lib/api/errors";
import type { PatchProfilePrefsBody } from "@/lib/api/profile-prefs-endpoints";
import type { MemberHall, MemberProfile } from "@/lib/api/types";
import { isSectionPrefShown, type SectionPrefKey } from "@/lib/profile/profile-sections";

import { EditSectionCard, type EditSectionToggle } from "./EditSectionCard";

type Overrides = Partial<Record<SectionPrefKey, boolean>>;

const KEY_CLASS = "bcc-mono text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary";
const VALUE_CLASS = "bcc-mono text-[11px] uppercase tracking-[0.12em] text-bcc-text";
const NOTE_CLASS = "font-serif text-[13px] italic text-bcc-text-secondary";
/** A ≥44px mono action link; theme text + accent underline, never accent text. */
const ACTION_LINK_CLASS =
  "bcc-mono inline-flex min-h-[44px] items-center text-[11px] uppercase tracking-[0.18em] text-bcc-text underline decoration-[var(--bcc-accent-indicator)] underline-offset-4";

const ACCOUNT_HREF = "/u/me?tab=account" as Route;
const BLOG_HREF = "/u/me?tab=blog" as Route;

const PREFS_ERROR_COPY: Record<string, string> = {
  bcc_unauthorized: "Sign in required.",
};

export interface EditAboutFormProps {
  handle: string;
  bio: string;
  verifications: MemberProfile["verifications"];
  /** The member's Halls (splitMemberHalls `halls`), server order. */
  halls: MemberHall[];
  blogTotal: number;
  /** `counts.reviews_received` — optional during the v1.49 rollout. */
  reviewTotal: number | undefined;
}

export function EditAboutForm({
  handle,
  bio,
  verifications,
  halls,
  blogTotal,
  reviewTotal,
}: EditAboutFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const bioId = useId();
  const bioHelpId = `${bioId}-help`;

  // This page is owner-only (the route redirects everyone else), so the
  // viewer's own prefs are always the right ones to read.
  const prefsQuery = useProfilePrefs();
  const prefsMutation = useUpdateProfilePrefs();
  const bioMutation = useUpdateBio();

  const [overrides, setOverrides] = useState<Overrides>({});
  const [bioDraft, setBioDraft] = useState<string | null>(null);
  const [savedBio, setSavedBio] = useState<string | null>(null);

  const prefs = prefsQuery.data;
  const saving = prefsMutation.isPending || bioMutation.isPending;

  const prefsDiff: PatchProfilePrefsBody = {};
  if (prefs !== undefined) {
    for (const [key, value] of Object.entries(overrides) as Array<[SectionPrefKey, boolean]>) {
      if (value !== isSectionPrefShown(prefs, key)) prefsDiff[key] = value;
    }
  }
  const prefsDirty = Object.keys(prefsDiff).length > 0;

  const baselineBio = savedBio ?? bio;
  const bioValue = bioDraft ?? baselineBio;
  const bioDirty = bioDraft !== null && bioDraft !== baselineBio;

  const dirty = prefsDirty || bioDirty;

  // Refresh / tab close with staged edits or a save in flight.
  useEffect(() => {
    if (!dirty && !saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  // Staged value, else the server's. Disabled until the prefs have loaded
  // (a guessed "On" must not be saveable) and while a save is in flight.
  const toggleFor = (key: SectionPrefKey): EditSectionToggle => ({
    value: overrides[key] ?? (prefs === undefined ? true : isSectionPrefShown(prefs, key)),
    pending: prefs === undefined || saving,
    onChange: (next) => setOverrides((prev) => ({ ...prev, [key]: next })),
  });

  async function handleSave() {
    if (!dirty || saving) return;
    prefsMutation.reset();
    bioMutation.reset();

    const prefsBody = prefsDiff;
    const nextBio = bioDirty ? bioDraft : null;
    const results = await Promise.allSettled([
      prefsDirty ? prefsMutation.mutateAsync(prefsBody) : Promise.resolve(null),
      nextBio !== null ? bioMutation.mutateAsync({ bio: nextBio }) : Promise.resolve(null),
    ]);
    const [prefsResult, bioResult] = results;

    let anySaved = false;
    if (prefsDirty && prefsResult.status === "fulfilled") {
      anySaved = true;
      // The mutation already wrote the server's copy into the prefs cache.
      setOverrides({});
      if ("show_reviews_on_profile" in prefsBody || "show_disputes_on_profile" in prefsBody) {
        // Same flags as Privacy → Hide my reviews / disputes.
        void queryClient.invalidateQueries({ queryKey: MY_PRIVACY_QUERY_KEY });
      }
    }
    if (nextBio !== null && bioResult.status === "fulfilled" && bioResult.value !== null) {
      anySaved = true;
      // The server sanitises; keep its copy, not what was typed.
      setSavedBio(bioResult.value.bio);
      setBioDraft(null);
    }
    // The About page and header read server props.
    if (anySaved) router.refresh();
  }

  function handleCancel() {
    setOverrides({});
    setBioDraft(null);
    prefsMutation.reset();
    bioMutation.reset();
  }

  const status = saveStatusFrom({
    isPending: saving,
    isError: prefsMutation.isError || bioMutation.isError,
    isSuccess: prefsMutation.isSuccess || bioMutation.isSuccess,
  });
  const errorMessage =
    bioMutation.error !== null
      ? humanizeBioError(bioMutation.error)
      : prefsMutation.error !== null
        ? humanizeCode(prefsMutation.error, PREFS_ERROR_COPY, "Your section settings didn't save. Try again.")
        : undefined;

  const verifiedRows = verificationRows(verifications);
  const encodedHandle = encodeURIComponent(handle);
  const returnTo = encodeURIComponent(`/u/${encodedHandle}/about/edit`);
  const claimQuery = `claim=1&return=${returnTo}`;

  return (
    <div>
      {prefsQuery.isError && prefs === undefined && (
        <div className="mb-4">
          <LoadFailure
            message="Couldn't load your SHOW ON PROFILE settings. Try again in a moment."
            onRetry={() => void prefsQuery.refetch()}
          />
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* YOUR BIO. The Figma frame also shows DETAILS (trade, location,
            website) here, sharing this same switch: show_about_on_profile
            is ONE server setting for the whole About section. DETAILS is
            omitted until those fields have a backend — location lives only
            in PeepSo's admin-defined field catalogue, under no fixed key. */}
        <EditSectionCard label="Your bio" testId="edit-card-bio" toggle={toggleFor("show_about_on_profile")}>
          <label htmlFor={bioId} className="sr-only">
            Your bio
          </label>
          <textarea
            id={bioId}
            value={bioValue}
            onChange={(e) => setBioDraft(e.target.value)}
            disabled={saving}
            rows={4}
            aria-describedby={bioHelpId}
            placeholder="What do you work on?"
            className="w-full resize-y rounded-sm border border-bcc-input-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50"
            style={{ fontSize: "16px", lineHeight: 1.55 }}
          />
          {/* No character counter: the server caps the bio in BYTES after
              sanitising, which the client cannot measure (see BioEditor). */}
          <p id={bioHelpId} className={`${KEY_CLASS} mt-2 normal-case tracking-[0.08em]`}>
            Shown in the About section of your profile.
          </p>
        </EditSectionCard>

        <EditSectionCard
          label="Verifications"
          testId="edit-card-verifications"
          toggle={toggleFor("show_verifications_on_profile")}
        >
          {verifiedRows.length > 0 ? (
            <ul className="flex flex-col divide-y divide-bcc-border">
              {verifiedRows.map((row) => (
                <li key={row.key} className="flex min-h-[44px] items-center justify-between gap-3">
                  <span className={`${VALUE_CLASS} min-w-0 truncate`}>
                    <span aria-hidden className="text-verified">✓ </span>
                    <span className="sr-only">Verified </span>
                    {row.label}
                    {row.detail !== null && (
                      <span className="ml-2 normal-case tracking-normal text-bcc-text-secondary">
                        {row.detail}
                      </span>
                    )}
                  </span>
                  <Link href={ACCOUNT_HREF} className={ACTION_LINK_CLASS}>
                    {row.action}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <p className={NOTE_CLASS}>Nothing verified on your profile.</p>
              <Link href={ACCOUNT_HREF} className={ACTION_LINK_CLASS}>
                Verify <span aria-hidden className="ml-1">→</span>
              </Link>
            </div>
          )}
          <p className={`${NOTE_CLASS} mt-3`}>
            Your wallet address is never shown. Hiding this section does not change your trust
            score.
          </p>
        </EditSectionCard>

        <EditSectionCard
          label="Halls"
          count={halls.length}
          testId="edit-card-halls"
          toggle={toggleFor("show_groups_on_profile")}
        >
          {/* SLOT — per-Hall show/hide (`hidden_hall_ids`) arrives in a later
              backend PR: a small switch per row goes here. Until then the
              one switch above (show_groups_on_profile) covers every Hall
              AND every group on the profile. */}
          {halls.length > 0 ? (
            <MembershipRows rows={halls} isHall layout="inline" />
          ) : (
            <p className={NOTE_CLASS}>No Halls to show.</p>
          )}
          <p className={`${NOTE_CLASS} mt-3`}>Roles are set by each Hall.</p>
        </EditSectionCard>

        <EditSectionCard
          label="Operator / Projects"
          testId="edit-card-operator"
          toggle={toggleFor("show_operator_on_profile")}
        >
          {/* SLOT — claimed validators / nodes / groups, each "Pending" until
              checked then "✓ Claimed", with a confirm-before-REMOVE. Not on
              the backend yet (claims on profile + claim return/pending).
              SLOT — "+ ADD A NODE" → the nodes search page, once one exists. */}
          <ul className="flex flex-col divide-y divide-bcc-border">
            <li>
              <Link href={`/validators?${claimQuery}` as Route} className={ACTION_LINK_CLASS}>
                + Add a validator
              </Link>
            </li>
            <li>
              <Link href={`/communities?${claimQuery}` as Route} className={ACTION_LINK_CLASS}>
                + Add a group
              </Link>
            </li>
          </ul>
        </EditSectionCard>

        <EditSectionCard
          label="Blogs"
          count={blogTotal}
          testId="edit-card-blogs"
          toggle={toggleFor("show_blogs_on_profile")}
        >
          <p className={NOTE_CLASS}>Your latest 2 blogs show on your About page.</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-6">
            <Link href={BLOG_HREF} className={ACTION_LINK_CLASS}>
              + Write a blog
            </Link>
            <Link href={BLOG_HREF} className={ACTION_LINK_CLASS}>
              Manage blogs <span aria-hidden className="ml-1">→</span>
            </Link>
          </div>
        </EditSectionCard>

        <EditSectionCard
          label="Reviews"
          count={reviewTotal}
          testId="edit-card-reviews"
          toggle={toggleFor("show_reviews_on_profile")}
        >
          <p className={NOTE_CLASS}>
            Reviews are written by other members. They can&apos;t be edited or deleted here.
          </p>
          {/* SLOT — reply to a review, once review replies land. */}
          {reviewTotal !== undefined && reviewTotal > 0 && (
            <AboutSeeAll href={`/u/${encodedHandle}/reviews` as Route}>
              See all {reviewTotal} reviews <span aria-hidden>→</span>
            </AboutSeeAll>
          )}
          <p className={`${KEY_CLASS} mt-2 normal-case tracking-[0.08em]`}>
            Same setting as Privacy → Hide my reviews.
          </p>
        </EditSectionCard>
      </div>

      {/* Sticky Cancel / Save bar. Mobile: fixed just above the bottom nav
          (z under its 200). md+: sticky to the column's bottom edge.
          TODO(#281): switch the offset to --bcc-mobile-nav-total-h once
          #281 merges (it adds the safe-area inset to the nav height). */}
      <div className="fixed inset-x-0 bottom-[var(--bcc-mobile-nav-h)] z-[150] border-t border-bcc-border bg-bcc-surface px-4 py-3 md:sticky md:inset-x-auto md:bottom-0 md:z-10 md:mt-6">
        <div className="mx-auto flex w-full max-w-[640px] flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <SettingsSaveStatus status={status} errorMessage={errorMessage} minWidthClass="min-w-0" />
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={!dirty || saving}
              className="bcc-stencil inline-flex min-h-[44px] items-center rounded-sm border border-bcc-border-strong px-4 text-[13px] uppercase tracking-[0.08em] text-bcc-text hover:bg-bcc-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              className={
                "bcc-stencil inline-flex min-h-[44px] items-center rounded-sm px-4 text-[13px] uppercase tracking-[0.08em] disabled:cursor-not-allowed " +
                (dirty && !saving
                  ? "bg-bcc-accent text-bcc-on-accent hover:bg-bcc-accent-light"
                  : "bg-bcc-surface-hover text-bcc-text-secondary")
              }
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface VerificationRow {
  key: string;
  label: string;
  detail: string | null;
  action: string;
}

/** Verified items only; the wallet row never carries an address. */
function verificationRows(v: MemberProfile["verifications"]): VerificationRow[] {
  const rows: VerificationRow[] = [];
  if (v.x_verified) {
    rows.push({
      key: "x",
      label: "X",
      detail: v.x_username !== null && v.x_username !== "" ? `@${v.x_username}` : null,
      action: "Reconnect",
    });
  }
  if (v.github_verified) {
    rows.push({
      key: "github",
      label: "GitHub",
      detail: v.github_username !== null && v.github_username !== "" ? v.github_username : null,
      action: "Reconnect",
    });
  }
  if (v.wallets_verified > 0) {
    rows.push({ key: "wallet", label: "Wallet", detail: null, action: "Re-verify" });
  }
  return rows;
}
