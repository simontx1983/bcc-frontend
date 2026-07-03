import type { Metadata } from "next";

import { LegalDoc, LegalSection, LegalP, LegalUL } from "@/components/legal/LegalDoc";
import { LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Terms of Service · Blue Collar Crypto",
  description: "The terms governing your use of Blue Collar Crypto.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalDoc
      docKey="terms"
      title="Terms of Service"
      intro={`These terms are a binding agreement between you and ${LEGAL.entity} ("we", "us", "our") governing your access to and use of ${LEGAL.brand} (the "Service"). Read them carefully — by using the Service you agree to them.`}
    >
      <LegalSection n={1} heading="Acceptance of these terms">
        <LegalP>
          By creating an account, linking a wallet, or otherwise accessing or
          using the Service, you confirm that you have read, understood, and
          agree to be bound by these Terms of Service and by our Privacy Policy
          and Cookie Policy, which are incorporated here by reference. If you do
          not agree, do not use the Service.
        </LegalP>
        <LegalP>
          If you use the Service on behalf of an organization, you represent
          that you are authorized to bind that organization, and &quot;you&quot;
          refers to that organization.
        </LegalP>
      </LegalSection>

      <LegalSection n={2} heading="Eligibility">
        <LegalP>You may use the Service only if you:</LegalP>
        <LegalUL>
          <li>are at least 18 years old and have the legal capacity to enter into these terms;</li>
          <li>are not barred from using the Service under the laws of your jurisdiction or any applicable sanctions or export-control regime;</li>
          <li>will comply with these terms and all applicable laws and regulations.</li>
        </LegalUL>
        <LegalP>
          We may refuse, suspend, or terminate access to anyone at our
          discretion, including where we reasonably believe eligibility
          requirements are not met.
        </LegalP>
      </LegalSection>

      <LegalSection n={3} heading="Accounts and security">
        <LegalP>
          You must provide accurate information when registering and keep it
          current. You are responsible for all activity under your account and
          for maintaining the confidentiality of your credentials. Notify us
          promptly at{" "}
          <a href={`mailto:${LEGAL.legalEmail}`} className="text-safety underline">{LEGAL.legalEmail}</a>{" "}
          of any unauthorized use. One person or entity may not maintain
          multiple accounts to manipulate reputation, disputes, or any other
          feature of the Service.
        </LegalP>
      </LegalSection>

      <LegalSection n={4} heading="Wallets, on-chain activity, and no custody">
        <LegalP>
          The Service lets you link blockchain wallet addresses by signing a
          message to prove control. <strong>We never take custody of your
          crypto assets, private keys, seed phrases, or funds, and we never
          initiate transactions on your behalf.</strong> You are solely
          responsible for the security of your wallets and keys.
        </LegalP>
        <LegalUL>
          <li>Blockchain networks are public and outside our control. Wallet addresses you link, and the on-chain holdings and activity associated with them, are publicly visible and may be indexed and displayed by the Service.</li>
          <li>On-chain transactions are generally irreversible. We are not responsible for losses arising from your use of wallets, smart contracts, bridges, marketplaces, validators, or any blockchain network.</li>
          <li>Displayed on-chain data (balances, holdings, validator information) is sourced from third-party providers and public networks and may be delayed, incomplete, or inaccurate.</li>
        </LegalUL>
      </LegalSection>

      <LegalSection n={5} heading="Acceptable use">
        <LegalP>You agree not to, and not to attempt to:</LegalP>
        <LegalUL>
          <li>create fake, duplicate, or automated accounts, or otherwise manipulate trust scores, reputation, attestations, votes, disputes, or on-chain gating;</li>
          <li>impersonate any person or entity, or misrepresent your affiliation;</li>
          <li>post or transmit content that is unlawful, fraudulent, defamatory, harassing, hateful, infringing, or that violates the rights of others;</li>
          <li>use the Service for market manipulation, fraud, money laundering, or any illegal activity;</li>
          <li>access the Service by automated means (bots, scrapers) except as expressly permitted, or circumvent rate limits, security, or fraud-prevention controls;</li>
          <li>interfere with, disrupt, probe, or attempt to gain unauthorized access to the Service, its infrastructure, or other users&apos; accounts;</li>
          <li>reverse engineer or misuse any part of the Service except to the extent that restriction is prohibited by law.</li>
        </LegalUL>
      </LegalSection>

      <LegalSection n={6} heading="Trust, reputation, and disputes">
        <LegalP>
          The Service computes and displays trust scores, reputation tiers,
          attestations, and community dispute outcomes. These are informational
          signals generated from user activity and on-chain data. They are{" "}
          <strong>not</strong> financial, investment, legal, or professional
          advice, are not guarantees of any person&apos;s trustworthiness or
          conduct, and should not be solely relied upon. We do not warrant their
          accuracy and may adjust the methodology at any time. Dispute
          adjudication is community-driven; outcomes are not legal determinations
          and we are not liable for them.
        </LegalP>
      </LegalSection>

      <LegalSection n={7} heading="Your content">
        <LegalP>
          You retain ownership of the content you submit (posts, comments,
          profile information, media). You grant us a worldwide, non-exclusive,
          royalty-free license to host, store, reproduce, adapt, and display
          your content solely to operate, provide, and improve the Service. You
          represent that you have the rights to your content and that it does not
          violate these terms or any law. We may remove content or restrict
          accounts that we believe violate these terms, without liability.
        </LegalP>
      </LegalSection>

      <LegalSection n={8} heading="Fraud prevention and monitoring">
        <LegalP>
          To protect the integrity of the Service, we use automated
          fraud-prevention measures including device checks, device
          fingerprinting, rate limiting, and audit logging to detect multiple
          accounts, automation, and abuse. By creating an account you consent to
          these checks, as further described in our Privacy Policy. We may
          suspend or restrict accounts we reasonably believe are engaged in fraud
          or abuse.
        </LegalP>
      </LegalSection>

      <LegalSection n={9} heading="Intellectual property">
        <LegalP>
          The Service, including its software, design, text, graphics, and
          trademarks, is owned by us or our licensors and protected by
          intellectual-property laws. Except for your own content and rights
          expressly granted here, we grant you a limited, revocable,
          non-transferable license to use the Service for its intended purpose.
          If you send us feedback or suggestions, you grant us a perpetual,
          royalty-free license to use them without obligation to you.
        </LegalP>
      </LegalSection>

      <LegalSection n={10} heading="Third-party services">
        <LegalP>
          The Service integrates third-party services (for example, blockchain
          RPC and data providers, single sign-on providers, media providers,
          hosting, and error monitoring) and may link to third-party sites. We do
          not control and are not responsible for third-party services or
          content, and your use of them may be governed by their own terms.
        </LegalP>
      </LegalSection>

      <LegalSection n={11} heading="Disclaimers">
        <LegalP>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot;
          WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY,
          INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT
          THE SERVICE WILL BE UNINTERRUPTED, SECURE, ERROR-FREE, OR THAT ANY DATA
          (INCLUDING TRUST SCORES OR ON-CHAIN DATA) WILL BE ACCURATE.
        </LegalP>
        <LegalP>
          CRYPTO ASSETS ARE VOLATILE AND CARRY SIGNIFICANT RISK. NOTHING ON THE
          SERVICE IS FINANCIAL, INVESTMENT, TAX, OR LEGAL ADVICE. YOU ARE SOLELY
          RESPONSIBLE FOR YOUR DECISIONS AND FOR SECURING YOUR WALLETS AND ASSETS.
        </LegalP>
      </LegalSection>

      <LegalSection n={12} heading="Limitation of liability">
        <LegalP>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR AFFILIATES,
          OFFICERS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, OR FOR ANY
          LOSS OF PROFITS, DATA, GOODWILL, OR CRYPTO ASSETS, ARISING FROM OR
          RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ALL CLAIMS
          RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS
          YOU PAID US FOR THE SERVICE IN THE 12 MONTHS BEFORE THE CLAIM OR (B)
          USD 100. SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS, SO SOME
          OF THESE MAY NOT APPLY TO YOU.
        </LegalP>
      </LegalSection>

      <LegalSection n={13} heading="Indemnification">
        <LegalP>
          You agree to indemnify and hold us harmless from any claims,
          liabilities, damages, losses, and expenses (including reasonable legal
          fees) arising from your use of the Service, your content, your wallets
          and on-chain activity, or your breach of these terms or any law.
        </LegalP>
      </LegalSection>

      <LegalSection n={14} heading="Suspension and termination">
        <LegalP>
          You may stop using the Service and request account deletion at any
          time. We may suspend or terminate your access, with or without notice,
          if we reasonably believe you have violated these terms or created risk
          or legal exposure. Sections that by their nature should survive
          termination (including intellectual property, disclaimers, limitation
          of liability, and indemnification) will survive.
        </LegalP>
      </LegalSection>

      <LegalSection n={15} heading="Changes to the Service and these terms">
        <LegalP>
          We may modify or discontinue the Service or these terms at any time. If
          we make material changes, we will update the effective date and, where
          appropriate, provide notice. Your continued use after changes take
          effect constitutes acceptance.
        </LegalP>
      </LegalSection>

      <LegalSection n={16} heading="Governing law and disputes">
        <LegalP>
          These terms are governed by the laws of {LEGAL.jurisdiction}, without
          regard to conflict-of-laws rules. Any dispute will be subject to the
          exclusive jurisdiction of the courts located in {LEGAL.jurisdiction},
          unless a binding arbitration or alternative dispute-resolution
          provision is added here and agreed by the parties. You and we agree to
          attempt in good faith to resolve disputes informally before initiating
          formal proceedings.
        </LegalP>
      </LegalSection>

      <LegalSection n={17} heading="Miscellaneous">
        <LegalP>
          These terms, together with the Privacy Policy and Cookie Policy, are
          the entire agreement between you and us regarding the Service. If any
          provision is held unenforceable, the rest remains in effect. Our
          failure to enforce a provision is not a waiver. You may not assign
          these terms without our consent; we may assign them in connection with
          a merger, acquisition, or sale of assets.
        </LegalP>
        <LegalP>
          Notices to us may be sent to{" "}
          <a href={`mailto:${LEGAL.legalEmail}`} className="text-safety underline">{LEGAL.legalEmail}</a>{" "}
          or {LEGAL.address}.
        </LegalP>
      </LegalSection>
    </LegalDoc>
  );
}
