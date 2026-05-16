"use client";

/**
 * ProfilePanel — "My Profile" tab content.
 *
 * Houses identity-bound profile metadata across four sub-tabs:
 *   About         → first/last name, display name, handle, bio, birthday
 *                   (each with a PeepSo-style privacy selector)
 *   Preference    → reserved — render preferences (locale, theme,
 *                   feed defaults) once shipped
 *   Notifications → reserved — render channel + category opt-ins
 *   Account       → wallets (verified chain links), plus future
 *                   account-grade controls (connections, deactivate)
 *
 * V1 scope (what ships today):
 *   - Sub-tab navigation
 *   - About: reads existing MemberProfile fields (display_name,
 *     handle, bio); first_name / last_name / birthday render as "—"
 *     placeholders until the §3.1 contract extends to ship them.
 *     Privacy selectors show the field-level enum (public / site
 *     members / friends only / only me) — currently read-only UI;
 *     a PATCH /me/about endpoint is the follow-up before they
 *     persist.
 *   - Account: wallet list with truncated address + primary ring
 *     (moved from the old FILE 06 SectionFrame).
 *   - Preference + Notifications: ComingSoonPanel stubs.
 *
 * Owner vs visitor — non-owners viewing this tab on someone else's
 * page see the same read-only fields (server filters by privacy at
 * egress). The privacy selectors + EDIT links only surface for the
 * owner.
 */

import Link from "next/link";
import type { Route } from "next";
import { useState, type ReactNode } from "react";

import type { MemberProfile, MemberWallet } from "@/lib/api/types";

type SubTab = "about" | "wallets" | "preference" | "notifications" | "account";

export interface ProfilePanelProps {
  profile: MemberProfile;
  isOwner: boolean;
}

export function ProfilePanel({ profile, isOwner }: ProfilePanelProps) {
  const [active, setActive] = useState<SubTab>("about");

  return (
    <section className="flex flex-col gap-6">
      <SubTabStrip active={active} onChange={setActive} />

      <div role="tabpanel" id={`profile-subpanel-${active}`}>
        {active === "about"         && <AboutSubTab profile={profile} isOwner={isOwner} />}
        {active === "wallets"       && <WalletsSubTab wallets={profile.wallets} isOwner={isOwner} />}
        {active === "preference"    && <PreferenceSubTab profile={profile} isOwner={isOwner} />}
        {active === "notifications" && <NotificationsSubTab isOwner={isOwner} />}
        {active === "account"       && <AccountSubTab profile={profile} isOwner={isOwner} />}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SubTabStrip — secondary tab strip styled quieter than the main one so
// nesting reads as a HIERARCHY, not parallel surfaces. Mono caps,
// underline-only active treatment, no big stencil weight.
// ──────────────────────────────────────────────────────────────────────

function SubTabStrip({
  active,
  onChange,
}: {
  active: SubTab;
  onChange: (key: SubTab) => void;
}) {
  const tabs: Array<{ key: SubTab; label: string }> = [
    { key: "about",         label: "About" },
    { key: "wallets",       label: "Wallets" },
    { key: "preference",    label: "Preference" },
    { key: "notifications", label: "Notifications" },
    { key: "account",       label: "Account" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Profile sections"
      className="flex flex-wrap gap-x-6 gap-y-2 border-b border-cardstock/15"
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`profile-subtab-${tab.key}`}
            aria-selected={isActive}
            aria-controls={`profile-subpanel-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={
              "bcc-mono pb-2 transition-colors border-b-2 " +
              (isActive
                ? "text-cardstock border-safety"
                : "text-cardstock-deep border-transparent hover:text-cardstock")
            }
            style={{ fontSize: "11px", letterSpacing: "0.18em" }}
          >
            {tab.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// AboutSubTab — PeepSo About surface mirror. Six fields with privacy
// selectors. First name / last name / birthday aren't on the current
// §3.1 MemberProfile contract; their rows render with "—" placeholder
// values until the server-side extension ships.
//
// Edit affordance: V1 routes to /settings/identity (canonical PeepSo
// authoring surface). Inline edits land when PATCH /me/about ships.
// ──────────────────────────────────────────────────────────────────────

type PrivacyValue = "public" | "site_members" | "friends_only" | "only_me";

const PRIVACY_LABELS: Record<PrivacyValue, string> = {
  public:        "PUBLIC",
  site_members:  "SITE MEMBERS",
  friends_only:  "FRIENDS ONLY",
  only_me:       "ONLY ME",
};

function AboutSubTab({ profile, isOwner }: { profile: MemberProfile; isOwner: boolean }) {
  // §3.1 placeholders — first_name / last_name / birthday aren't on
  // the contract yet. Server-side extension required before these
  // light up.
  const firstName = "";
  const lastName  = "";
  const birthday  = "";

  return (
    <article className="bcc-paper">
      <header className="bcc-paper-head">
        <h3 className="bcc-stencil" style={{ fontSize: "16px", letterSpacing: "0.18em" }}>
          About
        </h3>
        {isOwner && (
          <Link
            href={"/settings/identity" as Route}
            className="bcc-mono text-safety hover:underline"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            EDIT PROFILE →
          </Link>
        )}
      </header>

      <dl className="divide-y divide-ink/15">
        <AboutRow
          label="First name"
          value={firstName}
          isOwner={isOwner}
          editable
        />
        <AboutRow
          label="Last name"
          value={lastName}
          isOwner={isOwner}
          editable
        />
        <AboutRow
          label="Display name"
          value={profile.display_name}
          isOwner={isOwner}
          editable
        />
        <AboutRow
          label="Handle"
          value={`@${profile.handle}`}
          isOwner={isOwner}
          editable={false}
          note="(cannot be changed)"
        />
        <AboutRow
          label="About me"
          value={profile.bio}
          isOwner={isOwner}
          editable
          multiline
        />
        <AboutRow
          label="Birthday"
          value={birthday}
          isOwner={isOwner}
          editable
        />
      </dl>

      {/* Backend-work flag — visible only to owners during the
          transition window so it's clear which controls are live
          vs. shell-only. Remove this banner once /me/about PATCH +
          server-side first_name/last_name/birthday land. */}
      {isOwner && (
        <footer
          className="bcc-mono px-5 py-4 text-ink-soft"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          INLINE EDIT + PRIVACY PERSIST WILL LAND WITH PATCH /ME/ABOUT.
          EDITS TODAY ROUTE TO /SETTINGS/IDENTITY (PEEPSO).
        </footer>
      )}
    </article>
  );
}

function AboutRow({
  label,
  value,
  isOwner,
  editable,
  multiline,
  note,
}: {
  label: string;
  value: string;
  isOwner: boolean;
  editable: boolean;
  multiline?: boolean;
  note?: string;
}) {
  const hasValue = value.trim() !== "";
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[160px_1fr_auto] sm:items-center">
      <dt
        className="bcc-mono text-ink-soft"
        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
      >
        {label.toUpperCase()}
        {note !== undefined && (
          <span className="ml-2 normal-case text-ink-ghost" style={{ letterSpacing: "0" }}>
            {note}
          </span>
        )}
      </dt>
      <dd className="min-w-0">
        {hasValue ? (
          multiline === true ? (
            <p
              className="font-serif text-ink"
              style={{ fontSize: "15px", lineHeight: 1.5 }}
            >
              {value}
            </p>
          ) : (
            <p className="bcc-stencil text-ink" style={{ fontSize: "18px", letterSpacing: "0.02em" }}>
              {value}
            </p>
          )
        ) : (
          <p className="bcc-mono text-ink-ghost" style={{ fontSize: "12px", letterSpacing: "0.12em" }}>
            —
          </p>
        )}
      </dd>
      <div className="flex items-center gap-3 justify-self-start sm:justify-self-end">
        {isOwner ? (
          <>
            <PrivacySelect />
            {editable && (
              <Link
                href={"/settings/identity" as Route}
                className="bcc-mono text-safety hover:underline"
                style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              >
                EDIT
              </Link>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function PrivacySelect(): ReactNode {
  // V1: read-only display of PeepSo's 4-value privacy enum. The select
  // is visible but accepting changes requires PATCH /me/about (server
  // work). Defaults to "public" so the affordance reads as the open
  // option until the server returns a per-field privacy block.
  const [value, setValue] = useState<PrivacyValue>("public");
  return (
    <select
      value={value}
      onChange={(e) => setValue(e.target.value as PrivacyValue)}
      className="bcc-mono border border-ink/30 bg-cardstock px-2 py-1 text-ink"
      style={{ fontSize: "10px", letterSpacing: "0.18em" }}
      aria-label="Privacy"
    >
      {(Object.keys(PRIVACY_LABELS) as PrivacyValue[]).map((key) => (
        <option key={key} value={key}>
          {PRIVACY_LABELS[key]}
        </option>
      ))}
    </select>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PreferenceSubTab — PeepSo-shape profile preferences. Three sections:
//
//   Friendship & Messaging — who can send me friend requests, who can
//                            DM me, who can tag me in posts.
//   Search & Discovery     — appear in member search; show online
//                            status.
//   Privacy                — boolean hide-fields that map to the
//                            existing §3.1 `MemberPrivacy` block
//                            (binder / reviews / disputes / follower
//                            count / real name / email).
//
// V1 scope: controls render with current values (where the §3.1
// contract ships them — the privacy toggles read profile.privacy
// directly). Save mutations are not yet wired — same posture as
// About: the UI shell ships now, PATCH /me/preferences lands as the
// follow-up. Visitors don't see this sub-tab content (gated by the
// outer ProfilePanel's owner check); but if they ever do, the
// controls render disabled.
// ──────────────────────────────────────────────────────────────────────

type AudienceValue = "everyone" | "site_members" | "friends_only" | "nobody";

const AUDIENCE_LABELS: Record<AudienceValue, string> = {
  everyone:     "EVERYONE",
  site_members: "SITE MEMBERS",
  friends_only: "FRIENDS ONLY",
  nobody:       "NOBODY",
};

const FRIEND_REQUEST_AUDIENCES: AudienceValue[] = [
  "everyone",
  "site_members",
  "nobody",
];

const MESSAGE_AUDIENCES: AudienceValue[] = [
  "everyone",
  "site_members",
  "friends_only",
  "nobody",
];

const TAG_AUDIENCES: AudienceValue[] = [
  "everyone",
  "friends_only",
  "nobody",
];

function PreferenceSubTab({
  profile,
  isOwner,
}: {
  profile: MemberProfile;
  isOwner: boolean;
}) {
  return (
    <article className="bcc-paper">
      <header className="bcc-paper-head">
        <h3
          className="bcc-stencil"
          style={{ fontSize: "16px", letterSpacing: "0.18em" }}
        >
          Preferences
        </h3>
      </header>

      <PreferenceSection title="Friendship & Messaging">
        <AudienceRow
          label="Who can send me friend requests"
          defaultValue="everyone"
          options={FRIEND_REQUEST_AUDIENCES}
          disabled={!isOwner}
        />
        <AudienceRow
          label="Who can message me"
          defaultValue="everyone"
          options={MESSAGE_AUDIENCES}
          disabled={!isOwner}
        />
        <AudienceRow
          label="Who can tag me in posts"
          defaultValue="friends_only"
          options={TAG_AUDIENCES}
          disabled={!isOwner}
        />
      </PreferenceSection>

      <PreferenceSection title="Search & Discovery">
        <ToggleRow
          label="Show me in member search"
          defaultValue
          disabled={!isOwner}
        />
        <ToggleRow
          label="Show online status"
          defaultValue
          disabled={!isOwner}
        />
      </PreferenceSection>

      <PreferenceSection title="Privacy">
        <ToggleRow
          label="Hide watching"
          defaultValue={profile.privacy.watching_hidden}
          disabled={!isOwner}
        />
        <ToggleRow
          label="Hide reviews"
          defaultValue={profile.privacy.reviews_hidden}
          disabled={!isOwner}
        />
        <ToggleRow
          label="Hide disputes"
          defaultValue={profile.privacy.disputes_hidden}
          disabled={!isOwner}
        />
        <ToggleRow
          label="Hide follower count"
          defaultValue={profile.privacy.follower_count_hidden}
          disabled={!isOwner}
        />
        <ToggleRow
          label="Hide real name"
          defaultValue={profile.privacy.real_name_hidden}
          disabled={!isOwner}
        />
        <ToggleRow
          label="Hide email"
          defaultValue={profile.privacy.email_hidden}
          disabled={!isOwner}
        />
      </PreferenceSection>

      {isOwner && (
        <footer
          className="bcc-mono px-5 py-4 text-ink-soft"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          PREFERENCE SAVES WILL LAND WITH PATCH /ME/PREFERENCES.
          PRIVACY TOGGLES MIRROR THE EXISTING §3.1 MEMBERPRIVACY BLOCK.
        </footer>
      )}
    </article>
  );
}

function PreferenceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h4
        className="bcc-mono border-b border-dashed border-ink/20 px-5 py-3 text-ink-soft"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        {title.toUpperCase()}
      </h4>
      <dl className="divide-y divide-ink/15">{children}</dl>
    </section>
  );
}

function AudienceRow({
  label,
  defaultValue,
  options,
  disabled,
}: {
  label: string;
  defaultValue: AudienceValue;
  options: AudienceValue[];
  disabled: boolean;
}) {
  const [value, setValue] = useState<AudienceValue>(defaultValue);
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <dt
        className="bcc-mono text-ink"
        style={{ fontSize: "12px", letterSpacing: "0.12em" }}
      >
        {label.toUpperCase()}
      </dt>
      <dd className="justify-self-start sm:justify-self-end">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value as AudienceValue)}
          disabled={disabled}
          className="bcc-mono border border-ink/30 bg-cardstock px-2 py-1 text-ink disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {AUDIENCE_LABELS[opt]}
            </option>
          ))}
        </select>
      </dd>
    </div>
  );
}

function ToggleRow({
  label,
  defaultValue,
  disabled,
}: {
  label: string;
  defaultValue: boolean;
  disabled: boolean;
}) {
  const [checked, setChecked] = useState(defaultValue);
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <dt
        className="bcc-mono text-ink"
        style={{ fontSize: "12px", letterSpacing: "0.12em" }}
      >
        {label.toUpperCase()}
      </dt>
      <dd className="justify-self-start sm:justify-self-end">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 accent-safety disabled:opacity-60"
          />
          <span
            className="bcc-mono text-ink-soft"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            {checked ? "ON" : "OFF"}
          </span>
        </label>
      </dd>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// NotificationsSubTab — PeepSo-shape notifications panel. Two pieces:
//
//   1. Email digest frequency — single global control (instant /
//      daily / weekly / never) for everything not flagged as urgent.
//   2. Category × channel matrix — for each notification category
//      (comments, mentions, vouches, etc.), a checkbox per delivery
//      channel (on-site bell, email, push). The "instant" frequency
//      setting still respects the email column toggle — if email is
//      off for a category, the digest skips it.
//
// V1 scope: visual shell. Reads no server state yet (notification
// preferences aren't on §3.1 MemberProfile); defaults are
// reasonable-out-of-the-box (on-site = everything, email = trust +
// messages + mentions, push = messages + mentions only). Saves land
// when PATCH /me/notifications ships.
// ──────────────────────────────────────────────────────────────────────

type DigestFrequency = "instant" | "daily" | "weekly" | "never";

const DIGEST_LABELS: Record<DigestFrequency, string> = {
  instant: "INSTANT",
  daily:   "DAILY DIGEST",
  weekly:  "WEEKLY DIGEST",
  never:   "NEVER",
};

interface NotificationCategory {
  key: string;
  label: string;
  /** Default opt-in state per channel. */
  defaults: { onSite: boolean; email: boolean; push: boolean };
}

const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { key: "comments",     label: "Comments on your posts",     defaults: { onSite: true,  email: false, push: false } },
  { key: "reactions",    label: "Reactions on your posts",    defaults: { onSite: true,  email: false, push: false } },
  { key: "mentions",     label: "Mentions (@you)",             defaults: { onSite: true,  email: true,  push: true  } },
  { key: "messages",     label: "Direct messages",             defaults: { onSite: true,  email: true,  push: true  } },
  { key: "vouches",      label: "Vouches received",            defaults: { onSite: true,  email: true,  push: false } },
  { key: "stand_behind", label: "Stand-behinds received",      defaults: { onSite: true,  email: true,  push: false } },
  { key: "disputes",     label: "Disputes filed against you",  defaults: { onSite: true,  email: true,  push: true  } },
  { key: "reviews",      label: "New reviews on your pages",   defaults: { onSite: true,  email: true,  push: false } },
  { key: "watchers",     label: "New watchers (followers)",    defaults: { onSite: true,  email: false, push: false } },
  { key: "group_invites", label: "Group invites",              defaults: { onSite: true,  email: true,  push: false } },
];

function NotificationsSubTab({ isOwner }: { isOwner: boolean }) {
  const [frequency, setFrequency] = useState<DigestFrequency>("daily");

  return (
    <article className="bcc-paper">
      <header className="bcc-paper-head">
        <h3
          className="bcc-stencil"
          style={{ fontSize: "16px", letterSpacing: "0.18em" }}
        >
          Notifications
        </h3>
      </header>

      <PreferenceSection title="Email Digest Frequency">
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <dt
            className="bcc-mono text-ink"
            style={{ fontSize: "12px", letterSpacing: "0.12em" }}
          >
            HOW OFTEN SHOULD WE EMAIL YOU?
          </dt>
          <dd className="justify-self-start sm:justify-self-end">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as DigestFrequency)}
              disabled={!isOwner}
              className="bcc-mono border border-ink/30 bg-cardstock px-2 py-1 text-ink disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              aria-label="Email digest frequency"
            >
              {(Object.keys(DIGEST_LABELS) as DigestFrequency[]).map((key) => (
                <option key={key} value={key}>
                  {DIGEST_LABELS[key]}
                </option>
              ))}
            </select>
          </dd>
        </div>
      </PreferenceSection>

      {/* Category × channel matrix. PeepSo-style table header above the
          rows so the column ownership is unambiguous. */}
      <section>
        <h4
          className="bcc-mono border-b border-dashed border-ink/20 px-5 py-3 text-ink-soft"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
        >
          CATEGORIES
        </h4>
        <div
          className="bcc-mono grid items-center gap-x-3 border-b border-ink/15 px-5 py-2 text-ink-soft"
          style={{
            gridTemplateColumns: "1fr 70px 70px 70px",
            fontSize: "10px",
            letterSpacing: "0.18em",
          }}
        >
          <span />
          <span className="justify-self-center">ON SITE</span>
          <span className="justify-self-center">EMAIL</span>
          <span className="justify-self-center">PUSH</span>
        </div>
        <ul className="divide-y divide-ink/15">
          {NOTIFICATION_CATEGORIES.map((cat) => (
            <NotificationRow
              key={cat.key}
              label={cat.label}
              defaults={cat.defaults}
              disabled={!isOwner}
            />
          ))}
        </ul>
      </section>

      {isOwner && (
        <footer
          className="bcc-mono px-5 py-4 text-ink-soft"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          NOTIFICATION SAVES WILL LAND WITH PATCH /ME/NOTIFICATIONS.
        </footer>
      )}
    </article>
  );
}

function NotificationRow({
  label,
  defaults,
  disabled,
}: {
  label: string;
  defaults: { onSite: boolean; email: boolean; push: boolean };
  disabled: boolean;
}) {
  const [onSite, setOnSite] = useState(defaults.onSite);
  const [email,  setEmail]  = useState(defaults.email);
  const [push,   setPush]   = useState(defaults.push);

  return (
    <li
      className="grid items-center gap-x-3 px-5 py-3"
      style={{ gridTemplateColumns: "1fr 70px 70px 70px" }}
    >
      <span
        className="bcc-mono text-ink"
        style={{ fontSize: "12px", letterSpacing: "0.10em" }}
      >
        {label.toUpperCase()}
      </span>
      <span className="justify-self-center">
        <input
          type="checkbox"
          checked={onSite}
          onChange={(e) => setOnSite(e.target.checked)}
          disabled={disabled}
          aria-label={`On-site: ${label}`}
          className="h-4 w-4 accent-safety disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </span>
      <span className="justify-self-center">
        <input
          type="checkbox"
          checked={email}
          onChange={(e) => setEmail(e.target.checked)}
          disabled={disabled}
          aria-label={`Email: ${label}`}
          className="h-4 w-4 accent-safety disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </span>
      <span className="justify-self-center">
        <input
          type="checkbox"
          checked={push}
          onChange={(e) => setPush(e.target.checked)}
          disabled={disabled}
          aria-label={`Push: ${label}`}
          className="h-4 w-4 accent-safety disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </span>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────
// WalletsSubTab — verified chain links. Sits between About and
// Preference per the 2026-05-14 sub-tab order: identity-shape data
// first (About), then identity-anchored chain credentials (Wallets),
// then UX-shaped settings (Preference, Notifications), then
// account-management (Account).
// ──────────────────────────────────────────────────────────────────────

function WalletsSubTab({ wallets, isOwner }: { wallets: MemberWallet[]; isOwner: boolean }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="bcc-mono text-cardstock-deep">WALLETS</span>
        <span aria-hidden className="h-px flex-1 bg-cardstock/15" />
        {isOwner && (
          <Link
            href={"/settings/wallets" as Route}
            className="bcc-mono text-safety hover:underline"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            + ADD WALLET
          </Link>
        )}
      </div>

      {wallets.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {wallets.map((wallet) => (
            <WalletRow key={wallet.id} wallet={wallet} />
          ))}
        </ul>
      ) : (
        <p className="bcc-mono text-cardstock-deep/60">
          No wallets linked yet.
        </p>
      )}
    </section>
  );
}

function WalletRow({ wallet }: { wallet: MemberWallet }) {
  const full = wallet.address ?? wallet.address_short ?? "";
  const truncated = full.length <= 12
    ? full
    : `${full.slice(0, 6)}…${full.slice(-4)}`;
  const primaryRing = wallet.is_primary
    ? "border-l-4 border-safety"
    : "border-l-4 border-transparent";

  return (
    <li
      className={`bcc-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${primaryRing}`}
    >
      <span className="bcc-mono inline-flex items-center gap-3 text-ink">
        <span className="text-ink-soft">{wallet.chain_name.toUpperCase()}</span>
        <span className="font-mono text-ink" title={full}>
          {truncated}
        </span>
      </span>
      <span className="bcc-mono inline-flex items-center gap-2 text-verified">
        ✓ VERIFIED
        {wallet.is_primary && (
          <span className="text-weld">· PRIMARY</span>
        )}
      </span>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────
// AccountSubTab — sign-in credentials + connected accounts + sessions
// + account-deactivation/deletion. Maps to PeepSo's Account page
// (https://bluecollarcrypto.io/profile/.../about/account/).
//
// Sections:
//   1. Sign-in        — email, password, 2FA
//   2. Connected      — X / GitHub / wallet summary (per §V1.5)
//   3. Sessions       — count of active sessions (placeholder)
//   4. Danger zone    — data export · deactivate · delete (recoverable
//                       deactivation vs. irrevocable deletion live in
//                       different routes; same brutalist warning rail)
//
// V1 scope: shell with current-state read where available. Each row
// links to the canonical settings surface
// (`/settings/account`, `/settings/connections`, `/settings/wallets`)
// for actual edits. Inline mutations land when the corresponding
// PATCH endpoints ship.
//
// Owner-only sub-tab in practice (the outer ProfilePanel can render
// it for any viewer, but the email + password + danger-zone rows
// gate their CTAs on `isOwner`).
// ──────────────────────────────────────────────────────────────────────

function AccountSubTab({
  profile,
  isOwner,
}: {
  profile: MemberProfile;
  isOwner: boolean;
}) {
  return (
    <article className="bcc-paper">
      <header className="bcc-paper-head">
        <h3
          className="bcc-stencil"
          style={{ fontSize: "16px", letterSpacing: "0.18em" }}
        >
          Account
        </h3>
      </header>

      <PreferenceSection title="Sign-In">
        <AccountRow
          label="Email"
          value={profile.privacy.email_hidden ? "Hidden" : "—"}
          actionLabel="CHANGE"
          actionHref="/settings/account"
          isOwner={isOwner}
        />
        <AccountRow
          label="Password"
          value="••••••••"
          actionLabel="CHANGE PASSWORD"
          actionHref="/settings/account"
          isOwner={isOwner}
        />
        <AccountRow
          label="Two-factor authentication"
          value="Not configured"
          actionLabel="ENABLE 2FA"
          actionHref="/settings/account"
          isOwner={isOwner}
        />
      </PreferenceSection>

      <PreferenceSection title="Connected Accounts">
        <AccountRow
          label="X (Twitter)"
          value="Not connected"
          actionLabel="CONNECT"
          actionHref={"/settings/connections" as Route}
          isOwner={isOwner}
        />
        <AccountRow
          label="GitHub"
          value="Not connected"
          actionLabel="CONNECT"
          actionHref={"/settings/connections" as Route}
          isOwner={isOwner}
        />
        <AccountRow
          label="Verified wallets"
          value={`${profile.wallets.length} on file`}
          actionLabel="MANAGE"
          actionHref={"/settings/wallets" as Route}
          isOwner={isOwner}
        />
      </PreferenceSection>

      <PreferenceSection title="Sessions">
        <AccountRow
          label="Active sessions"
          value="1 active (this device)"
          actionLabel="MANAGE SESSIONS"
          actionHref="/settings/account"
          isOwner={isOwner}
        />
      </PreferenceSection>

      <PreferenceSection title="Danger Zone">
        <AccountRow
          label="Export your data"
          value="JSON archive of your posts, attestations, and activity"
          actionLabel="REQUEST EXPORT"
          actionHref="/settings/account"
          isOwner={isOwner}
        />
        <AccountRow
          label="Deactivate account"
          value="Hide your profile; recoverable on next sign-in"
          actionLabel="DEACTIVATE"
          actionHref="/settings/account"
          actionTone="warning"
          isOwner={isOwner}
        />
        <AccountRow
          label="Delete account"
          value="Permanent. Removes your data after the 30-day grace window."
          actionLabel="DELETE"
          actionHref="/settings/account"
          actionTone="danger"
          isOwner={isOwner}
        />
      </PreferenceSection>

      {isOwner && (
        <footer
          className="bcc-mono px-5 py-4 text-ink-soft"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          ACCOUNT EDITS ROUTE TO /SETTINGS/ACCOUNT TODAY. INLINE 2FA
          ENROLL + EXPORT + DEACTIVATE LAND WITH THE DEDICATED FLOWS.
        </footer>
      )}
    </article>
  );
}

type AccountActionTone = "default" | "warning" | "danger";

function AccountRow({
  label,
  value,
  actionLabel,
  actionHref,
  actionTone = "default",
  isOwner,
}: {
  label: string;
  value: string;
  actionLabel: string;
  actionHref: Route;
  actionTone?: AccountActionTone;
  isOwner: boolean;
}) {
  const toneClass =
    actionTone === "danger"
      ? "text-safety"
      : actionTone === "warning"
      ? "text-weld"
      : "text-ink hover:text-safety";

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[200px_1fr_auto] sm:items-center">
      <dt
        className="bcc-mono text-ink-soft"
        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
      >
        {label.toUpperCase()}
      </dt>
      <dd className="min-w-0">
        <p
          className="font-serif text-ink"
          style={{ fontSize: "14px", lineHeight: 1.5 }}
        >
          {value}
        </p>
      </dd>
      {isOwner && (
        <Link
          href={actionHref}
          className={`bcc-mono justify-self-start hover:underline sm:justify-self-end ${toneClass}`}
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
