import type { Metadata } from "next";

import { AnalyticsConsentControl } from "@/components/analytics/AnalyticsConsentControl";
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
          <li><strong>Wallet and on-chain information</strong> — addresses you link using a signature, the link to your BCC account, and the public on-chain holdings and activity we use for supported features.</li>
          <li><strong>Profile and activity</strong> — content you create (posts, comments, media), reactions, attestations, reviews, disputes, group memberships, and trust/reputation signals derived from your activity.</li>
          <li><strong>Device and technical information</strong> — IP address, request information, browser and device characteristics, and a device fingerprint for fraud and multiple-account detection (see section 4).</li>
          <li><strong>Usage information</strong> — pages viewed, actions taken, timestamps, and request metadata, used to operate and secure the Service.</li>
          <li><strong>Communications</strong> — private messages you send or receive through the Service, messages you send us, and notification and email preferences.</li>
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
          for these fingerprint records are stored as keyed hashes. This
          applies to our fingerprint records. Hosting and security providers
          receive IP addresses when they handle requests. When we use
          Cloudflare Turnstile to check for bots, our server may send
          Cloudflare the challenge response and your IP address for verification.
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
          Service. Linking a wallet creates an account association within BCC.
          Other members may see derived signals such as a verification badge.
          BCC keeps linked wallet addresses, member-specific holdings and
          wallet activity private from other members.
        </LegalP>
      </LegalSection>

      <LegalSection n={6} heading="Legal bases (EEA/UK users)">
        <LegalP>
          Where the GDPR or UK GDPR applies, we rely on the following legal
          bases: <strong>performance of a contract</strong> (to provide the
          Service you request); <strong>legitimate interests</strong> (to secure
          the Service, prevent fraud, and operate trust features, balanced
          against your rights); <strong>consent</strong> (for fraud-prevention
          device checks at signup, for optional product analytics, and where
          otherwise indicated, which you may withdraw); and <strong>legal obligation</strong> (to comply with
          applicable law).
        </LegalP>
      </LegalSection>

      <LegalSection n={7} heading="How we share information">
        <LegalP>
          We do not sell your personal information. We share it only with:
        </LegalP>
        <LegalUL>
          <li><strong>Hosting and storage.</strong> Vercel serves the website. Our WordPress hosting processes account, content and API requests and manages uploaded media. These systems receive request information such as IP addresses as part of delivering the Service.</li>
          <li><strong>Services you choose to use.</strong> Google or X handles your sign-in choices when you select that provider. Your browser contacts GIPHY when you open the GIF picker, when you search for GIFs and when it loads GIPHY-hosted images. GIPHY receives your IP address and any search terms you enter. Wallet connections and blockchain lookups involve your wallet software and supported blockchain data providers.</li>
          <li><strong>Delivery, security and measurement.</strong> Email providers receive the destination address and message for delivery. A password-reset email may include the IP address that requested the reset. If you enable browser push, the browser&apos;s push service processes the subscription and notification for delivery. Cloudflare verifies bot challenges. Vercel Web Analytics, Sentry diagnostics and optional PostHog product analytics are described in section 14.</li>
          <li><strong>Password safety.</strong> When you set a password, our server checks it against Have I Been Pwned by sending the first five characters of a hash and comparing the rest locally. The password itself stays with BCC.</li>
          <li><strong>Legal and safety</strong> — where required by law, legal process, or to protect the rights, safety, and integrity of the Service and its users.</li>
          <li><strong>Business transfers</strong> — in connection with a merger, acquisition, financing, or sale of assets, subject to this policy.</li>
        </LegalUL>
      </LegalSection>

      <LegalSection n={8} heading="International transfers">
        <LegalP>
          We and our providers may process information in countries other than
          yours. Contact our privacy team for information about transfers that
          apply to your data.
        </LegalP>
      </LegalSection>

      <LegalSection n={9} heading="Retention">
        <LegalP>
          Retention depends on the type of record, its purpose, and applicable
          legal, security, fraud-prevention and dispute-resolution needs. You can
          contact our privacy team about retention or request deletion as
          described below. Public on-chain data remains on the blockchain.
        </LegalP>
      </LegalSection>

      <LegalSection n={10} heading="Security">
        <LegalP>
          We use technical and organizational measures to protect information,
          including password hashing, keyed IP hashes in fingerprint records, signed authentication
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
          Membership is limited to people aged 18 or older. To report an
          account that may belong to someone under 18, contact{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`} className="text-[var(--bcc-accent)] underline">{LEGAL.privacyEmail}</a>.
          We review those reports and handle the account and its information
          under applicable requirements.
        </LegalP>
      </LegalSection>

      <LegalSection n={13} heading="Cookies and local storage">
        <LegalP>
          We use a small number of cookies and browser-storage entries that are
          strictly necessary or functional. If you allow product analytics
          (section 14), PostHog also stores an analytics identifier and session
          state on this browser; it stores nothing until you allow it. See our
          Cookie Policy for details and choices.
        </LegalP>
      </LegalSection>

      <LegalSection n={14} heading="Product analytics">
        <LegalP>
          If you allow it, we use PostHog, a product-analytics provider, to
          understand how the Service is used. Analytics is off until you allow
          it on this browser, and you can turn it off again at any time. Your
          choice is stored on this browser and is kept when you sign out.
        </LegalP>
        <LegalP>When analytics is on, we record:</LegalP>
        <LegalUL>
          <li><strong>Pages you open</strong> — the page address only, without its query string or fragment. Addresses that name a person, a post or a dispute are recorded as their page type (for example a member profile is recorded as &ldquo;/u/[handle]&rdquo;), never the handle or id itself.</li>
          <li><strong>Link tags</strong> — if you arrived through a tagged link, only its source, medium and campaign tags (utm_source, utm_medium, utm_campaign), shortened to 100 characters. Other link tags and advertising click identifiers are discarded.</li>
          <li><strong>A small set of actions</strong> — publishing a post, publishing a comment, joining a community, following or unfollowing a member, completing onboarding, and linking or unlinking a wallet. These carry only basic details such as the kind of post, the community type, or the chain.</li>
          <li><strong>Sign-up and setup steps</strong> — starting and finishing sign-up, viewing and finishing each onboarding step, and starting and finishing a validator claim. These carry only the sign-up method (password, Google, X or wallet), the onboarding step name, or the chain. Every event also carries whether you are signed in (member or anonymous).</li>
          <li><strong>Errors</strong> the site runs into, with any page addresses stripped of query strings.</li>
          <li><strong>Standard technical details</strong> PostHog attaches to each event, such as browser type and version (including your browser&rsquo;s user-agent string) and screen size. PostHog receives request IP information and may derive approximate location from it.</li>
        </LegalUL>
        <LegalP>
          If you are signed in, these events are linked to a pseudonymous
          identifier: a keyed hash of your account number, computed on our
          servers with a secret key, so it cannot be traced back to your
          account without that key. It is never your name, handle, or email. We drop PostHog events from sign-in,
          sign-up completion, password-reset, email-verification, or messaging
          pages (on the sign-up page itself we record only the page view and
          which sign-up method you started), and we do not
          use session recording, heatmaps, or automatic click tracking.
          Analytics is not used for advertising.
        </LegalP>
        <LegalP>
          <strong>Your choice.</strong> Turning analytics off stops collection
          from this browser straight away. To ask us to delete analytics data
          already collected, contact{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`} className="text-[var(--bcc-accent)] underline">{LEGAL.privacyEmail}</a>.
        </LegalP>
        <LegalP>
          <strong>Vercel Web Analytics.</strong> Separately, our host Vercel
          counts page views in aggregate. It uses no cookies and stores
          no analytics identifier on your device. The PostHog choice does
          not control Vercel Web Analytics. Page
          addresses are sent without their query string or fragment, with
          person identifiers replaced as above. Page-view events are dropped on
          sign-in, sign-up completion, password-reset, email-verification or
          messaging pages. Along with the page address, Vercel records the
          referring site, and derives your country, browser, operating system
          and device type from the request. Visitors are counted with an
          identifier that resets every day. Vercel processes request IP
          information for measurement. Hosting logs are separate from Web
          Analytics.
        </LegalP>
        <LegalP>
          <strong>Vercel Speed Insights.</strong> When enabled, Vercel receives
          sampled page performance measurements and technical information about
          the visit. We filter reported paths and exclude the same sensitive
          routes as Web Analytics. The PostHog choice does not control this service.
        </LegalP>
        <LegalP>
          <strong>Sentry diagnostics.</strong> When configured, Sentry receives
          errors and sampled performance data to help us diagnose issues.
          We filter diagnostic data and disable default collection of personal
          information. Session Replay is disabled. The PostHog choice applies
          to PostHog and does not control these diagnostics.
        </LegalP>
        <div id="analytics-choice" className="mt-4">
          <AnalyticsConsentControl />
        </div>
      </LegalSection>

      <LegalSection n={15} heading="Changes to this policy">
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
