/**
 * /settings/account — login credentials + linked accounts + delete.
 *
 * Renders inside SettingsLayout (auth + persistent hero + nav).
 * Three sections: account credentials (email/password/delete), verified
 * connections (X / GitHub), and linked wallets.
 */

import { getServerSession } from "next-auth";

import { ConnectionsSection } from "@/components/settings/ConnectionsSection";
import { WalletsSection } from "@/components/settings/WalletsSection";
import { AccountSection } from "@/components/settings/profile/AccountSection";
import { authOptions } from "@/lib/auth";

import { SettingsSectionHeader } from "../_components/SettingsSectionHeader";

export default async function AccountSettingsPage() {
  const session = await getServerSession(authOptions);
  const sessionEmail =
    typeof session?.user.email === "string" ? session.user.email : "";

  return (
    <>
      <section className="mx-auto mt-10 max-w-3xl px-6 sm:px-8">
        <SettingsSectionHeader
          eyebrow="LOGIN"
          title="Email, password, deletion"
          blurb="Update how you sign in. Every change asks for your current password to confirm. Account deletion is permanent."
        />
        <div className="mt-4">
          <AccountSection currentEmail={sessionEmail} />
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-3xl px-6 sm:px-8">
        <SettingsSectionHeader
          eyebrow="VERIFIED ACCOUNTS"
          title="Linked external accounts"
          blurb="Connect X and GitHub to strengthen your identity. Each connection shows on your profile and feeds into your trust score."
        />
        <div className="mt-4">
          <ConnectionsSection />
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-3xl px-6 sm:px-8">
        <SettingsSectionHeader
          eyebrow="WALLETS"
          title="Linked addresses"
          blurb="Wallets you've verified by signing a challenge. Each unlocks on-chain credentials on your profile and lets you sign disputes."
        />
        <div className="mt-4">
          <WalletsSection />
        </div>
      </section>
    </>
  );
}
