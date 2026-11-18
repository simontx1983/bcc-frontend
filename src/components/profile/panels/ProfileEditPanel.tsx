/**
 * ProfileEditPanel — the owner's real profile editor, mounted on the
 * "My Profile" tab of /u/[handle].
 *
 * Replaces the former ProfilePanel, which was a read-only SHADOW of the
 * settings surface: About / Wallets / Preference / Notifications /
 * Account sub-tabs whose selects and toggles were local `useState` and
 * saved nothing, with "edit" links pointing at routes that didn't exist.
 * It also rendered those personal-settings sub-tabs to *visitors*.
 *
 * The sections mount the genuinely-wired editors:
 *   - ProfileHero       → avatar, cover photo, cover crop, display name
 *   - BioEditor         → the bio, via the existing PATCH /me/profile
 *   - HandleSection     → change the handle (F-333; see its docblock)
 *   - ProfileFieldsList → the admin-configured profile-field catalogue,
 *                         each with its own visibility
 *   - FootprintCard     → read-only contribution counts from profile.counts
 *
 * The section headers exist to separate two things users conflated: the
 * DISPLAY NAME (free text, changeable anytime, shown on posts) and the
 * HANDLE (the profile address). The handle section previously carried the
 * title "Your handle" over the blurb "How everyone on the Floor sees you"
 * — which describes the display name, so the one place the two had to be
 * told apart was where they were blurred together.
 *
 * Owner-only by construction: ProfileTabs registers this tab with
 * `ownerOnly: true`, so a visitor never sees it. Every mutation targets
 * session-scoped `/me/*` endpoints, so ownership is enforced server-side
 * regardless of what the client renders.
 */

import { HandleSection } from "@/components/settings/HandleSection";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { BioEditor } from "@/components/settings/profile/BioEditor";
import { ProfileFieldsList } from "@/components/settings/profile/ProfileFieldsList";
import { ProfileHero } from "@/components/settings/profile/ProfileHero";
import type { MemberCounts, MemberProfile } from "@/lib/api/types";

export interface ProfileEditPanelProps {
  profile: MemberProfile;
}

export function ProfileEditPanel({ profile }: ProfileEditPanelProps) {
  return (
    // gap-5 between cards; the descendant variant tightens every card in
    // this panel to the 7px Figma radius without touching .bcc-panel
    // elsewhere. pb-8 is the extra clearance on top of the shell's own
    // --bcc-mobile-nav-total-h padding on .bcc-col-center, so the last
    // card never sits flush against the bottom nav.
    <section className="flex flex-col gap-5 pb-8 [&_.bcc-panel]:rounded-[7px]">
      <section>
        <SettingsSectionHeader
          eyebrow="PHOTOS & NAME"
          title="Photos and display name"
          blurb="Your avatar, cover image, and the name people see on your posts."
        />
        {/* No `nav` slot — on the profile page the page's own tab strip is
            the navigation, so the hero renders bare. ProfileHero calls
            router.refresh() after each mutation, which revalidates this
            page's server component so the header card picks up the new
            avatar without a hard reload. */}
        <div className="mt-4">
          <ProfileHero profile={profile} />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="ABOUT YOU"
          title="Your bio"
          blurb="A short introduction shown at the top of your profile."
        />
        <div className="mt-4">
          <BioEditor profile={profile} />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="YOUR LINK"
          title="Handle"
          blurb="The address people use to reach your profile."
        />
        <div className="mt-4">
          <HandleSection handle={profile.handle} />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="PROFILE DETAILS"
          title="Profile details"
          blurb="Choose what to share and who can see each item."
        />
        <div className="mt-4">
          <ProfileFieldsList />
        </div>
      </section>

      <FootprintCard counts={profile.counts} />
    </section>
  );
}

/**
 * "Your Footprint" — the owner's own contribution counts, read verbatim from
 * the server-rolled `profile.counts`. Nothing is computed here.
 */
function FootprintCard({ counts }: { counts: MemberCounts }) {
  const rows: ReadonlyArray<{ label: string; value: number }> = [
    { label: "REVIEWS WRITTEN", value: counts.reviews_written },
    { label: "DISPUTES SIGNED", value: counts.disputes_signed },
    { label: "BLOG POSTS", value: counts.blog_posts_written },
    { label: "SOLIDS RECEIVED", value: counts.solids_received },
  ];
  return (
    <section>
      <SettingsSectionHeader
        eyebrow="YOUR FOOTPRINT"
        title="Your footprint"
        blurb="What you've contributed on the Floor so far."
      />
      <dl className="bcc-panel mt-4 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1">
            <dt className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-secondary">
              {row.label}
            </dt>
            <dd className="bcc-stencil text-2xl text-bcc-text">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
