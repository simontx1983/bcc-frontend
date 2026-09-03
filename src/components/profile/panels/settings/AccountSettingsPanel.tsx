/**
 * AccountSettingsPanel — owner-only "Account" tab on /u/[handle].
 *
 * Six sections, ordered from routine to irreversible:
 *
 *   1. SIGN-IN            email + password
 *   2. VERIFIED ACCOUNTS  X / GitHub
 *   3. WALLETS            linked addresses
 *   4. SECURITY ACTIVITY  the event record
 *   5. SECURITY ACTIONS   sign out everywhere
 *   6. DANGER ZONE        account deletion, alone
 *
 * Deletion previously sat as the third card inside the login section,
 * sharing the visual rhythm of a routine save. It now has its own zone
 * at the end, marked with the safety token.
 *
 * Sign-out-everywhere is deliberately NOT in the Danger Zone. It is
 * disruptive but reversible by signing in again, and grouping it with
 * a permanent deletion would blunt what "danger" means here.
 *
 * Section headings are owned here. `WalletsSection` and
 * `ConnectionsSection` each used to render a second, near-identical
 * heading of their own, so those two sections showed the same title
 * twice — costly on a phone and confusing anywhere.
 *
 * `currentEmail` is threaded from the server session via the profile
 * page — the settings page read it with getServerSession, which a
 * client-rendered tab panel can't do. The page passes "" for anyone who
 * is not the owner, and this whole tab is owner-gated upstream.
 */

import { AccountActivitySection } from "@/components/settings/AccountActivitySection";
import { ConnectionsSection } from "@/components/settings/ConnectionsSection";
import { SessionsRevokeSection } from "@/components/settings/SessionsRevokeSection";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { WalletsSection } from "@/components/settings/WalletsSection";
import { AccountSection } from "@/components/settings/profile/AccountSection";
import { DeleteAccountCard } from "@/components/settings/profile/DeleteAccountCard";

export function AccountSettingsPanel({ currentEmail }: { currentEmail: string }) {
  return (
    <section className="flex flex-col gap-10">
      <p className="font-serif text-[15px] text-bcc-text-secondary">
        Manage how you sign in and secure your account. These settings are
        private.
      </p>

      <section>
        <SettingsSectionHeader
          eyebrow="SIGN-IN"
          title="How you sign in"
          blurb="Your email address and password. Both changes ask for your current password to confirm."
        />
        <div className="mt-4">
          <AccountSection currentEmail={currentEmail} />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="VERIFIED ACCOUNTS"
          title="Connected accounts"
          blurb="Connect X and GitHub to strengthen your identity. Each connection shows on your profile."
        />
        <div className="mt-4">
          <ConnectionsSection />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="WALLETS"
          title="Linked wallets"
          blurb="Wallets you've verified by signing a challenge. Each unlocks on-chain credentials and lets you sign disputes."
        />
        <div className="mt-4">
          <WalletsSection />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="SECURITY ACTIVITY"
          title="Recent security events"
          blurb="Email changes, password changes, wallet links and sign-outs. If something here doesn't match an email you received, act on it."
        />
        <div className="mt-4">
          <AccountActivitySection />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="SECURITY ACTIONS"
          title="Sign out everywhere"
          blurb="Signs you out on every device, including this one. You can sign back in normally."
        />
        <div className="mt-4">
          <SessionsRevokeSection />
        </div>
      </section>

      {/* Danger zone. Separated with the existing safety token — a dashed
          rule and a tinted eyebrow — rather than any new colour literal,
          and the separation is deliberately applied to the ZONE, not to
          the routine controls above it. */}
      <section className="border-t-2 border-dashed border-safety/40 pt-8">
        <SettingsSectionHeader
          eyebrow="DANGER ZONE"
          title="Delete account"
          blurb="Permanent. This cannot be undone."
        />
        <div className="mt-4">
          <DeleteAccountCard />
        </div>
      </section>
    </section>
  );
}
