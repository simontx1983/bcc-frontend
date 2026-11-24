/**
 * F-579, the vocabulary half (Phillip, 2026-11-24):
 *   - people are "members";
 *   - "Operator" ONLY means the owner of a claimed page;
 *   - "Vouches" everywhere (not Supporters or Endorsements);
 *   - the top tier is "Elite";
 *   - "My Progression" is "Standing".
 *
 * Source-text assertions per surface: each pins the new wording and the
 * old one's absence, so a revert of any single line goes red. The page-owner
 * sense of "operator" (claim, announcements, queued messages, the OPERATOR
 * pill) is deliberately untouched and not asserted here.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ATTESTATION_COPY } from "@/lib/copy/trust-layer";
import { presentationName } from "@/lib/format";
import { QUICK_LINKS } from "@/components/layout/nav-items";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
/** Code only: comments may still explain history. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// [file, the new wording, the old wording that must be gone]
const SURFACES: ReadonlyArray<readonly [string, string, string]> = [
  ["src/app/(main)/(app)/members/page.tsx", "{query.data.pagination.total} MEMBER", "{query.data.pagination.total} OPERATOR"],
  ["src/app/(main)/(app)/members/page.tsx", "No members on file yet.", "No operators on file yet."],
  ["src/app/(main)/(app)/members/page.tsx", "FILE INDEX \\u00a0//\\u00a0 ALL MEMBERS", "ALL OPERATORS"],
  ["src/components/feed/DiscoverPanel.tsx", "RECENTLY ACTIVE MEMBERS", "RECENTLY ACTIVE OPERATORS"],
  ["src/app/(main)/(app)/u/[handle]/page.tsx", 'kind="MEMBER"', 'kind="OPERATOR"'],
  ["src/app/(main)/(app)/u/[handle]/opengraph-image.tsx", '"MEMBER ON THE FLOOR"', '"OPERATOR ON THE FLOOR"'],
  ["src/app/(main)/(app)/u/[handle]/opengraph-image.tsx", 'railLabel: "MEMBER FILE"', 'railLabel: "OPERATOR FILE"'],
  ["src/app/(main)/(app)/u/[handle]/opengraph-image.tsx", "Blue Collar Crypto member file", "Blue Collar Crypto operator file"],
  ["src/components/messages/ConversationsPanel.tsx", "every member has a file", "every operator has a file"],
  ["src/components/profile/panels/BackingPanel.tsx", "This member has no vouches yet", "no supporters yet"],
  ["src/components/layout/SiteHeader.tsx", 'label: "Standing"', '"My Progression"'],
  ["src/app/(main)/(app)/me/progression/page.tsx", "MEMBER &nbsp;//&nbsp; STANDING", "OPERATOR &nbsp;//&nbsp; STANDING"],
  ["src/app/(main)/(app)/me/reliability/page.tsx", "MEMBER &nbsp;//&nbsp; RELIABILITY", "OPERATOR &nbsp;//&nbsp; RELIABILITY"],
  ["src/app/(main)/(app)/members/mentors/page.tsx", "Veteran members in Trusted standing", "Veteran operators"],
  ["src/components/settings/profile/MentorSettingsSection.tsx", "so newer members can", "so newer operators can"],
  ["src/components/settings/NotificationPrefsForm.tsx", "Someone vouched for you — your profile", "operator profile"],
  ["src/components/profile/panels/BlogPanel.tsx", "That post belongs to another member", "belongs to another operator"],
  ["src/components/profile/panels/BlogPanel.tsx", "another member&rsquo;s blog", "another operator&rsquo;s blog"],
  ["src/components/profile/StandingFileBody.tsx", "members on the floor.", "operators on the floor."],
  ["src/components/profile/ReliabilityMirrorBody.tsx", "members at your current tier.", "operators at your current tier."],
  ["src/components/profile/SlotHoldersPicker.tsx", "that member&rsquo;s work", "that operator&rsquo;s work"],
  ["src/components/profile/EndorsementsGivenView.tsx", "Pages this member has vouched for", "Pages this operator has vouched for"],
  ["src/components/identity/AuthorVouchButton.tsx", "back this member.", "back this operator."],
  ["src/components/cards/CardActionBar.tsx", 'targetKind === "user_profile" ? "back this member." : "back this page."', "back this operator."],
  ["src/components/onboarding/OnboardingTrustLayerSteps.tsx", "Members back,", "Operators back,"],
  ["src/components/onboarding/OnboardingTrustLayerSteps.tsx", "I think this member is competent.", "I think this operator is competent."],
  ["src/components/onboarding/OnboardingTrustLayerSteps.tsx", "this member&rsquo;s work", "this operator&rsquo;s work"],
  ["src/components/onboarding/reputation-demo/DemoAuthorCard.tsx", "@demo-member", "@demo-operator"],
  ["src/components/onboarding/reputation-demo/DemoPostCard.tsx", ">Demo Member<", ">Demo Operator<"],
  ["src/components/onboarding/reputation-demo/combos.ts", 'tierLabel: "Elite"', 'tierLabel: "Proven"'],
  ["src/components/onboarding/reputation-demo/combos.ts", "most members sit while", "most operators sit while"],
  ["src/components/identity/RankInfoModal.tsx", 'label: "Elite"', 'label: "Proven"'],
  ["src/lib/tour/registry.ts", "validators, projects, and creators you watch", "operators, projects, and creators you watch"],
  ["src/lib/tour/registry.ts", "that member's reputation", "that operator's reputation"],
  ["src/components/disputes/OpenDisputeModal.tsx", "Our team has been notified.", "An operator has been notified."],
  ["src/components/entity/ChainTabs.tsx", "Chains this validator runs on", "Chains this operator runs on"],
  ["src/app/(main)/(app)/explore/explore-tabs.ts", "the pages members vouch for and review", "the pages operators vouch for"],
  // The follow-up: the Explore rails, and a member's meta description.
  ["src/app/(main)/(app)/explore/KindDirectoryPage.tsx", "FILE INDEX \\u00a0//\\u00a0 ALL PROJECTS", "ALL OPERATORS"],
  ["src/app/(main)/(app)/explore/KindDirectoryPage.tsx", "FILE INDEX \\u00a0//\\u00a0 ALL CREATORS", "ALL OPERATORS"],
  ["src/app/(main)/(app)/explore/page.tsx", "FILE INDEX \\u00a0//\\u00a0 ALL VALIDATORS", "STAKING OPERATORS"],
  ["src/app/(main)/(app)/members/members-tabs.ts", "The people on BCC: find them by trust, rank and what they run.", "Every operator on the floor."],
  ["src/app/(main)/(app)/u/[handle]/page.tsx", "a member on the Floor: trust, identity, and reputation in crypto.", "reputation for crypto operators"],
  ["src/lib/profile/load-member-subpage.ts", "a member on the Floor: trust, identity, and reputation in crypto.", "reputation for crypto operators"],
];

describe("F-579 vocabulary", () => {
  it.each(SURFACES)("%s says %j, not %j", (file, now, before) => {
    const src = code(file);
    expect(src).toContain(now);
    expect(src).not.toContain(before);
  });

  it('the Vouches tab: one label for both profile and page tabs, key still "backing"', () => {
    expect(ATTESTATION_COPY.supporters_tab).toBe("Vouches");
    expect(code("src/components/profile/ProfileTabs.tsx")).toContain('{ key: "backing",   label: ATTESTATION_COPY.supporters_tab }');
    expect(code("src/components/entity/EntityTabs.tsx")).toContain('{ key: "backing",  label: ATTESTATION_COPY.supporters_tab }');
  });

  it("the quick link to /me/progression is called Standing", () => {
    expect(QUICK_LINKS.find((l) => l.href === "/me/progression")?.label).toBe("Standing");
  });

  it("a person with no usable name or handle reads as MEMBER", () => {
    expect(presentationName({ display_name: "", handle: "" })).toBe("MEMBER");
  });

  it("silence copy speaks of members", () => {
    expect(code("src/lib/copy/trust-layer.ts")).toContain("Most members remain silent");
  });
});
