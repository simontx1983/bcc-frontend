import type { Metadata } from "next";

import { LegalDoc, LegalSection, LegalP, LegalUL } from "@/components/legal/LegalDoc";
import { LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Privacy Policy · Blue Collar Crypto",
  description: "How Blue Collar Crypto collects, uses, and protects your information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalDoc
      docKey="privacy"
      title="Privacy Policy"
      intro={`This policy explains what information ${LEGAL.brand} collects, why, how we use and share it, and the choices and rights you have. ${LEGAL.entity} is the controller responsible for your information.`}
    >
      <LegalSection n={1} heading="Scope">
        <LegalP>
          This policy applies to information we process when you use{" "}
          {LEGAL.brand} (the &quot;Service&quot;). It should be read together with
          our Cookie Policy and Terms of Service.
        </LegalP>
      </LegalSection>

      <LegalSection n={2} heading="Information we collect">
        <LegalP>We collect the following categories of information:</LegalP>
        <LegalUL>
          <li><strong>Account information</strong> — email address, chosen handle, display name, and a securely hashed password (we never store passwords in plain text).</li>
          <li><strong>Wallet and on-chain information</strong> — blockchain wallet addresses you link (verified by a signature), and the public on-chain holdings, tokens, NFT, and validator activity associated with them. This data is public on the blockchain; we index and display it.</li>
          <li><strong>Profile and activity</strong> — content you create (posts, comments, media), reactions, attestations, reviews, disputes, group memberships, and trust/reputation signals derived from your activity.</li>
          <li><strong>Device and technical information</strong> — IP address (stored only in hashed form for security), browser and device characteristics, and a device fingerprint used for fraud and multiple-account detection (see section 4).</li>
          <li><strong>Usage information</strong> — pages viewed, actions taken, timestamps, and request metadata, used to operate and secure the Service.</li>
          <li><strong>Communications</strong> — messages you send us and, where applicable, notification and email preferences.</li>
          <li><strong>Authentication data from single sign-on</strong> — if you sign in with Google or X, we receive basic profile information (such as your email and identifier) from that provider.</li>
        </LegalUL>
      </LegalSection>

      <LegalSection n={3} heading="How we use information">
        <LegalP>We use information to:</LegalP>
        <LegalUL>
          <li>provide, maintain, and improve the Service and your account;</li>
          <li>compute and display trust, reputation, and on-chain gating features;</li>
          <li>detect, prevent, and respond to fraud, abuse, multiple accounts, automation, and security incidents;</li>
          <li>communicate with you about your account, security, and Service updates;</li>
          <li>comply with legal obligations and enforce our terms.</li>
        </LegalUL>
      </LegalSection>

      <LegalSection n={4} heading="Device fingerprinting and fraud prevention">
        <LegalP>
          To protect the integrity of trust and reputation and to prevent
          sybil / multiple-account abuse, we generate a device fingerprint from
          server-side signals (such as network and request characteristics) and
          from limited browser-reported signals (such as an automation flag and
          screen characteristics). We use it to detect when one device or actor
          controls multiple accounts and to score automation. IP addresses used
          in this process are stored only as keyed hashes, not in raw form.
        </LegalP>
        <LegalP>
          <strong>Consent.</strong> When you create an account, you consent to
          these fraud-prevention device checks. Admin-provisioned accounts and
          visitors who do not complete signup are not fingerprinted in this way.
          The legal basis is your consent and our legitimate interest in
          securing the Service.
        </LegalP>
      </LegalSection>

      <LegalSection n={5} heading="Public blockchain data">
        <LegalP>
          Blockchain networks are public and, by design, permanent and outside
          our control. Wallet addresses you link and their associated on-chain
          activity are publicly visible on the relevant network regardless of our
          Service. When you link a wallet, you acknowledge that this information
          is public and may be displayed and associated with your profile.
        </LegalP>
      </LegalSection>

      <LegalSection n={6} heading="Legal bases (EEA/UK users)">
        <LegalP>
          Where the GDPR or UK GDPR applies, we rely on the following legal
          bases: <strong>performance of a contract</strong> (to provide the
          Service you request); <strong>legitimate interests</strong> (to secure
          the Service, prevent fraud, and operate trust features, balanced
          against your rights); <strong>consent</strong> (for fraud-prevention
          device checks at signup and where otherwise indicated, which you may
          withdraw); and <strong>legal obligation</strong> (to comply with
          applicable law).
        </LegalP>
      </LegalSection>

      <LegalSection n={7} heading="How we share information">
        <LegalP>
          We do not sell your personal information. We share it only with:
        </LegalP>
        <LegalUL>
          <li><strong>Service providers / processors</strong> that help us run the Service, including cloud hosting and deployment, error and performance monitoring, blockchain RPC and data providers (used to read public on-chain data), single sign-on providers, media providers, and email delivery. These providers process data on our behalf under contractual safeguards.</li>
          <li><strong>Legal and safety</strong> — where required by law, legal process, or to protect the rights, safety, and integrity of the Service and its users.</li>
          <li><strong>Business transfers</strong> — in connection with a merger, acquisition, financing, or sale of assets, subject to this policy.</li>
        </LegalUL>
      </LegalSection>

      <LegalSection n={8} heading="International transfers">
        <LegalP>
          We and our providers may process information in countries other than
          yours, including the United States and the European Union. Where
          required, we use appropriate safeguards (such as standard contractual
          clauses) for cross-border transfers.
        </LegalP>
      </LegalSection>

      <LegalSection n={9} heading="Retention">
        <LegalP>
          We keep personal information for as long as your account is active and
          as needed to provide the Service, then for a reasonable period to meet
          legal, security, fraud-prevention, and dispute-resolution needs, after
          which we delete or anonymize it. Security records such as fingerprint
          data are retained only for the period necessary for fraud prevention.
          Note that public on-chain data cannot be deleted from the blockchain by
          us.
        </LegalP>
      </LegalSection>

      <LegalSection n={10} heading="Security">
        <LegalP>
          We use technical and organizational measures to protect information,
          including password hashing, hashed IP storage, signed authentication
          tokens, access controls, rate limiting, and audit logging. No method of
          transmission or storage is completely secure, and we cannot guarantee
          absolute security. You are responsible for safeguarding your
          credentials and wallet keys.
        </LegalP>
      </LegalSection>

      <LegalSection n={11} heading="Your rights and choices">
        <LegalP>
          Depending on where you live, you may have rights to access, correct,
          delete, port, or restrict processing of your personal information, to
          object to certain processing, and to withdraw consent. Where the CCPA
          applies, you have rights to know, delete, correct, and to not be
          discriminated against for exercising them; we do not sell or share
          personal information for cross-context behavioral advertising.
        </LegalP>
        <LegalP>
          To exercise your rights, contact{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`} className="text-[var(--bcc-accent)] underline">{LEGAL.privacyEmail}</a>.
          We may need to verify your identity. You may also have the right to
          complain to your local data-protection authority.
        </LegalP>
      </LegalSection>

      <LegalSection n={12} heading="Children">
        <LegalP>
          The Service is not directed to children under 18, and we do not
          knowingly collect their information. If you believe a child has
          provided us information, contact us and we will delete it.
        </LegalP>
      </LegalSection>

      <LegalSection n={13} heading="Cookies and local storage">
        <LegalP>
          We use a small number of cookies and browser-storage entries that are
          strictly necessary or functional. See our Cookie Policy for details and
          choices.
        </LegalP>
      </LegalSection>

      <LegalSection n={14} heading="Changes to this policy">
        <LegalP>
          We may update this policy from time to time. We will change the
          effective date and, for material changes, provide notice where
          appropriate. Your continued use after changes take effect constitutes
          acceptance.
        </LegalP>
      </LegalSection>
    </LegalDoc>
  );
}
