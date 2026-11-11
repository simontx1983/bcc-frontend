import type { Metadata } from "next";

import { AnalyticsConsentControl } from "@/components/analytics/AnalyticsConsentControl";
import { LegalDoc, LegalSection, LegalP, LegalUL } from "@/components/legal/LegalDoc";
import { LEGAL } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Cookie Policy · Blue Collar Crypto",
  description: "How Blue Collar Crypto uses cookies and browser storage.",
  alternates: { canonical: "/cookies" },
};

interface StorageRow {
  name: string;
  type: string;
  purpose: string;
  category: "Strictly necessary" | "Functional" | "Analytics (opt-in)";
}

const STORAGE: StorageRow[] = [
  { name: "Session token", type: "Cookie (HttpOnly)", purpose: "Keeps you signed in and secures authenticated requests.", category: "Strictly necessary" },
  { name: "CSRF token", type: "Cookie", purpose: "Protects sign-in and session actions against cross-site request forgery.", category: "Strictly necessary" },
  { name: "Theme preference", type: "Local storage", purpose: "Remembers your light/dark theme choice.", category: "Functional" },
  { name: "Sidebar state", type: "Local storage", purpose: "Remembers whether you collapsed the navigation sidebar.", category: "Functional" },
  { name: "Fraud-check flag", type: "Session storage", purpose: "Records that this session already ran the once-per-session fraud-prevention device check, so it is not repeated.", category: "Functional" },
  { name: "Draft autosave", type: "Local storage", purpose: "Temporarily saves long-form drafts you are writing so you don't lose them.", category: "Functional" },
  { name: "Analytics choice", type: "Local storage", purpose: "Remembers whether you allowed or declined product analytics on this browser.", category: "Functional" },
  { name: "Sign-up analytics marker", type: "Session storage", purpose: "Set only if you allow product analytics, when you create an account: holds which sign-up method you used (password, Google, X or wallet) until the next page, which reports it and deletes it. Also deleted when you sign out.", category: "Analytics (opt-in)" },
  { name: "PostHog analytics (ph_…)", type: "Cookie and local storage", purpose: "Set only if you allow product analytics: an analytics identifier and session state used by PostHog. Cleared when you turn analytics off, apart from a small marker PostHog keeps to record that analytics is off.", category: "Analytics (opt-in)" },
];

export default function CookiesPage() {
  return (
    <LegalDoc
      docKey="cookies"
      title="Cookie Policy"
      intro={`This policy explains how ${LEGAL.brand} uses cookies and similar browser-storage technologies, and the choices you have. It supplements our Privacy Policy.`}
    >
      <LegalSection n={1} heading="What these technologies are">
        <LegalP>
          Cookies are small text files stored on your device. We also use
          related browser technologies such as local storage and session
          storage. Together we refer to them as &quot;storage.&quot; We use only
          a small number, and we do <strong>not</strong> use advertising or
          cross-site tracking cookies.
        </LegalP>
      </LegalSection>

      <LegalSection n={2} heading="Categories we use">
        <LegalUL>
          <li><strong>Strictly necessary</strong> — required for the Service to work, such as keeping you signed in and protecting requests. These cannot be switched off without breaking core functionality.</li>
          <li><strong>Functional</strong> — remember your preferences (such as theme and layout) and support security features like the once-per-session fraud check. They improve your experience but are not used to track you across sites.</li>
          <li><strong>Analytics (opt-in)</strong> — set only if you allow product analytics, to understand how the Service is used. Nothing in this category is stored until you allow it. See section 14 of our Privacy Policy.</li>
        </LegalUL>
      </LegalSection>

      <LegalSection n={3} heading="Storage we use">
        <div className="overflow-x-auto">
          <table className="mt-1 w-full border-collapse text-left" style={{ fontSize: "13px" }}>
            <thead>
              <tr className="border-b border-[var(--bcc-border)]">
                {["Name", "Type", "Purpose", "Category"].map((h) => (
                  <th
                    key={h}
                    className="bcc-mono py-2 pr-4 text-[var(--bcc-text-secondary)]"
                    style={{ fontSize: "10px", letterSpacing: "0.16em", verticalAlign: "bottom" }}
                  >
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STORAGE.map((row) => (
                <tr key={row.name} className="border-b border-dashed border-[var(--bcc-border-light)] align-top">
                  <td className="py-3 pr-4 text-[var(--bcc-text)]" style={{ lineHeight: 1.5 }}>{row.name}</td>
                  <td className="py-3 pr-4 text-[var(--bcc-text-secondary)]" style={{ lineHeight: 1.5 }}>{row.type}</td>
                  <td className="py-3 pr-4 text-[var(--bcc-text-secondary)]" style={{ lineHeight: 1.5, minWidth: 220 }}>{row.purpose}</td>
                  <td className="py-3 pr-2 text-[var(--bcc-text-secondary)]" style={{ lineHeight: 1.5 }}>{row.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection n={4} heading="Third-party services">
        <LegalP>
          Some providers we use to run the Service may set their own cookies or
          receive technical data when you interact with them — for example, our
          hosting and content-delivery provider, our error and performance
          monitoring provider, and single sign-on providers (Google or X) when
          you choose to sign in with them, and our product-analytics provider
          (PostHog) if you allow analytics. Their use of cookies is governed by
          their own policies.
        </LegalP>
      </LegalSection>

      <LegalSection n={5} heading="Managing storage">
        <LegalP>
          You can control cookies and clear browser storage through your browser
          settings, and you can clear our functional storage at any time. Because
          the strictly-necessary items are required for authentication, blocking
          them may prevent you from signing in or using core features.
        </LegalP>
        <LegalP>
          You can allow or turn off product analytics for this browser here:
        </LegalP>
        <div className="mt-3">
          <AnalyticsConsentControl />
        </div>
      </LegalSection>

      <LegalSection n={6} heading="Changes">
        <LegalP>
          We may update this Cookie Policy as the Service evolves. We will update
          the effective date when we do. Questions? Contact{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`} className="text-[var(--bcc-accent)] underline">{LEGAL.privacyEmail}</a>.
        </LegalP>
      </LegalSection>
    </LegalDoc>
  );
}
