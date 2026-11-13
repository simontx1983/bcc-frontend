/**
 * The server-rendered About sections — ABOUT, VERIFICATIONS, HALLS and
 * OPERATOR / PROJECTS (groups). Each returns null when it has nothing to
 * show (Figma note 36: an empty section is hidden, not stubbed).
 *
 * Every value is a server field rendered as-is. Not rendered because the
 * backend does not ship them yet: LOCATION, TRADE, WEBSITE, verification
 * dates, and the validator/node claim subsections of OPERATOR / PROJECTS.
 */

import Link from "next/link";

import { formatJoinDate } from "@/lib/format";
import type { MemberHall, MemberProfile } from "@/lib/api/types";

import { AboutCard } from "./AboutCard";
import { memberHallHref, splitMemberHalls } from "./member-halls";

const KEY_CLASS = "bcc-mono text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary";
const VALUE_CLASS = "bcc-mono text-[11px] uppercase tracking-[0.12em] text-bcc-text";

export function AboutBioCard({ profile }: { profile: MemberProfile }) {
  const bio = profile.bio.trim();
  // Same formatter the profile FileRail's JOINED reads.
  const joined = formatJoinDate(profile.joined_at);
  const hasJoined = joined !== "—";
  if (bio === "" && !hasJoined) return null;

  return (
    <AboutCard label="About" testId="about-card-bio">
      {bio !== "" && (
        <p
          className="whitespace-pre-line font-serif text-bcc-text"
          style={{ fontSize: "15px", lineHeight: 1.55 }}
        >
          {bio}
        </p>
      )}
      {hasJoined && (
        <dl className={bio !== "" ? "mt-4 border-t border-dashed border-bcc-border pt-3" : ""}>
          <div className="flex items-baseline justify-between gap-3">
            <dt className={KEY_CLASS}>Joined</dt>
            <dd className={VALUE_CLASS}>{joined}</dd>
          </div>
        </dl>
      )}
    </AboutCard>
  );
}

export function AboutVerificationsCard({ profile }: { profile: MemberProfile }) {
  const v = profile.verifications;
  const rows: Array<{ key: string; label: string; detail: string | null }> = [];
  if (v.x_verified) {
    rows.push({
      key: "x",
      label: "X",
      detail: v.x_username !== null && v.x_username !== "" ? `@${v.x_username}` : null,
    });
  }
  if (v.github_verified) {
    rows.push({
      key: "github",
      label: "GitHub",
      detail: v.github_username !== null && v.github_username !== "" ? v.github_username : null,
    });
  }
  // The non-identifying count only — never a wallet address or any wallet
  // detail, which is own-account-only by policy.
  if (v.wallets_verified > 0) {
    rows.push({ key: "wallet", label: "Wallet", detail: "Verified" });
  }
  if (rows.length === 0) return null;

  return (
    <AboutCard label="Verifications" testId="about-card-verifications">
      <ul className="flex flex-col divide-y divide-bcc-border">
        {rows.map((row) => (
          <li key={row.key} className="flex min-h-[44px] items-center justify-between gap-3">
            <span className={VALUE_CLASS}>
              <span aria-hidden className="text-verified">✓ </span>
              <span className="sr-only">Verified </span>
              {row.label}
            </span>
            {row.detail !== null && (
              <span className="bcc-mono min-w-0 truncate text-[11px] text-bcc-text-secondary">
                {row.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 font-serif text-[13px] italic text-bcc-text-secondary">
        Wallet addresses are never shown.
      </p>
    </AboutCard>
  );
}

export function AboutHallsCard({ profile }: { profile: MemberProfile }) {
  const { halls } = splitMemberHalls(profile.halls);
  if (halls.length === 0) return null;
  return (
    <AboutCard label="Halls" count={halls.length} testId="about-card-halls">
      <MembershipRows rows={halls} isHall layout="inline" />
    </AboutCard>
  );
}

export function AboutGroupsCard({ profile }: { profile: MemberProfile }) {
  const { groups } = splitMemberHalls(profile.halls);
  if (groups.length === 0) return null;
  return (
    <AboutCard label="Operator / Projects" testId="about-card-groups">
      <h3 className={KEY_CLASS}>Groups · {groups.length}</h3>
      <div className="mt-2">
        <MembershipRows rows={groups} isHall={false} layout="stacked" />
      </div>
    </AboutCard>
  );
}

/**
 * One ≥44px row per membership. `role_label` is the server's string,
 * rendered verbatim; null/absent → no badge. Halls put the role on the
 * right; groups put it under the name.
 */
function MembershipRows({
  rows,
  isHall,
  layout,
}: {
  rows: readonly MemberHall[];
  isHall: boolean;
  layout: "inline" | "stacked";
}) {
  return (
    <ul className="flex flex-col divide-y divide-bcc-border">
      {rows.map((row) => {
        const href = memberHallHref(row, isHall);
        const role =
          typeof row.role_label === "string" && row.role_label !== "" ? row.role_label : null;
        const body = (
          <>
            <span className={layout === "stacked" ? "flex min-w-0 flex-col" : "min-w-0 truncate"}>
              <span className="bcc-mono block truncate text-[13px] text-bcc-text">{row.name}</span>
              {layout === "stacked" && role !== null && (
                <span className="bcc-mono text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary" data-testid="membership-role">
                  {role}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {layout === "inline" && role !== null && (
                <span className="bcc-mono text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary" data-testid="membership-role">
                  {role}
                </span>
              )}
              {href !== null && (
                <span aria-hidden className="text-bcc-text-secondary">→</span>
              )}
            </span>
          </>
        );
        return (
          <li key={row.id}>
            {href !== null ? (
              <Link
                href={href}
                className="flex min-h-[44px] items-center justify-between gap-3 py-1 hover:bg-bcc-surface-hover"
              >
                {body}
              </Link>
            ) : (
              <div className="flex min-h-[44px] items-center justify-between gap-3 py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
