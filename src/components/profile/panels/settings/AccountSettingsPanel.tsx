/**
 * AccountSettingsPanel — owner-only "Account" tab on /u/[handle].
 *
 * Lifted from the retired /settings/account page: same wired sections,
 * same hooks. Only the page-level width wrapper is dropped, since the
 * profile page already constrains the column.
 *
 * `currentEmail` is threaded from the server session via the profile
 * page — the settings page read it with getServerSession, which a
 * client-rendered tab panel can't do.
 */

import { AccountActivitySection } from "@/components/settings/AccountActivitySection";
import { ConnectionsSection } from "@/components/settings/ConnectionsSection";
import { SessionsRevokeSection } from "@/components/settings/SessionsRevokeSection";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { WalletsSection } from "@/components/settings/WalletsSection";
import { AccountSection } from "@/components/settings/profile/AccountSection";

export function AccountSettingsPanel({ currentEmail }: { currentEmail: string }) {
  return (
    <section className="flex flex-col gap-10">
      <section>
        <SettingsSectionHeader
          eyebrow="LOGIN"
          title="Email, password, deletion"
          blurb="Update how you sign in. Every change asks for your current password to confirm. Account deletion is permanent."
        />
        <div className="mt-4">
          <AccountSection currentEmail={currentEmail} />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="VERIFIED ACCOUNTS"
          title="Linked external accounts"
          blurb="Connect X and GitHub to strengthen your identity. Each connection shows on your profile and feeds into your trust score."
        />
        <div className="mt-4">
          <ConnectionsSection />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="WALLETS"
          title="Linked addresses"
          blurb="Wallets you've verified by signing a challenge. Each unlocks on-chain credentials on your profile and lets you sign disputes."
        />
        <div className="mt-4">
          <WalletsSection />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="ACCOUNT ACTIVITY"
          title="Security events on this account"
          blurb="Email changes, password changes, wallet links, and sign-out actions. Cross-reference with the email alerts you receive — if anything here doesn't match an email you got, something's wrong."
        />
        <div className="mt-4">
          <AccountActivitySection />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="SESSIONS"
          title="Sign out everywhere"
          blurb="If you suspect a stolen session, invalidate every active sign-in at once. You'll need to sign back in on every device."
        />
        <div className="mt-4">
          <SessionsRevokeSection />
        </div>
      </section>
    </section>
  );
}
