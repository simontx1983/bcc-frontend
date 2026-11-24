import {
  Activity,
  Compass,
  Globe,
  Home,
  MessageSquare,
  Scale,
  Settings,
  TrendingUp,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";

import { WatchIcon } from "@/components/icons/registry";
import { LEGAL_ROUTES } from "@/lib/legal/config";

/**
 * Canonical site navigation — the SINGLE source of truth for the desktop
 * LeftSidebar, the phone bar (MobileNav), the phone Menu (MainOffcanvas)
 * and the avatar menu's "You" items (SiteHeader). Add, remove, or reorder
 * a destination HERE, once.
 *
 * Site Structure A: Explore = pages, Members = people, Communities =
 * groups, then the viewer's own Messages and Watching. Moved, not removed:
 * Halls → Communities ▸ Halls, Directory + Validators → Explore, Mentors →
 * Members ▸ Mentors, Disputes → "My cases" in the You items.
 *
 * History: these lists were once duplicated in LeftSidebar and
 * MainOffcanvas, plus a dead `nav-config` copy whose consumers were never
 * rendered. That cluster was deleted; every live nav imports from here.
 *
 * Each item carries its lucide component (`Icon`); consumers draw it with
 * <NavIcon> so every surface uses the same geometry. Items are `as const`
 * so `href` stays a literal route type for typedRoutes-checked `<Link>`.
 * `sub` is the small mono sub-label ("pages", "people"…), or null.
 */
const HOME = { label: "Home", href: "/", sub: null, Icon: Home } as const;
const EXPLORE = { label: "Explore", href: "/explore", sub: "pages", Icon: Compass } as const;
const MEMBERS = { label: "Members", href: "/members", sub: "people", Icon: Users } as const;
const COMMUNITIES = { label: "Communities", href: "/communities", sub: "groups", Icon: Globe } as const;
const MESSAGES = { label: "Messages", href: "/messages", sub: null, Icon: MessageSquare } as const;
const WATCHING = { label: "Watching", href: "/watching", sub: "your list", Icon: WatchIcon } as const;

/** The public sections, shown to everyone. */
export const PRIMARY_NAV = [HOME, EXPLORE, MEMBERS, COMMUNITIES] as const;

/** The viewer's own pages. Signed in only: they send a guest to /login. */
export const MEMBER_NAV = [MESSAGES, WATCHING] as const;

export type NavItem = (typeof PRIMARY_NAV)[number] | (typeof MEMBER_NAV)[number];

/**
 * The nav groups for this viewer, drawn with a dashed separator between
 * them. A guest gets the public sections only.
 */
export function navGroupsFor(signedIn: boolean): readonly (readonly NavItem[])[] {
  return signedIn ? [PRIMARY_NAV, MEMBER_NAV] : [PRIMARY_NAV];
}

/** A nav item's glyph, the same size and stroke on every surface. */
export function NavIcon({ Icon, filled = false }: { Icon: LucideIcon; filled?: boolean }) {
  return filled ? (
    <Icon size={20} strokeWidth={1.7} aria-hidden fill="var(--bcc-accent)" fillOpacity={0.15} />
  ) : (
    <Icon size={20} strokeWidth={1.7} aria-hidden />
  );
}

/** One slot of the phone bar: a nav link, the ＋ (New Post), or Menu. */
export type PhoneBarSlot =
  | { readonly kind: "link"; readonly item: NavItem }
  | { readonly kind: "post" }
  | { readonly kind: "menu" };

const POST_SLOT = { kind: "post" } as const;
const MENU_SLOT = { kind: "menu" } as const;
const linkSlot = (item: NavItem): PhoneBarSlot => ({ kind: "link", item });

/**
 * Phone bar, signed in: posting is a member's main action, so ＋ holds
 * the centre. Members sits in the Menu, one tap deeper.
 */
export const PHONE_BAR_SIGNED_IN: readonly PhoneBarSlot[] = [
  linkSlot(HOME),
  linkSlot(EXPLORE),
  POST_SLOT,
  linkSlot(COMMUNITIES),
  MENU_SLOT,
];

/**
 * Phone bar, guest: guests can't post, so Members takes the ＋ slot and
 * all three kinds of thing are one tap away.
 */
export const PHONE_BAR_GUEST: readonly PhoneBarSlot[] = [
  linkSlot(HOME),
  linkSlot(EXPLORE),
  linkSlot(MEMBERS),
  linkSlot(COMMUNITIES),
  MENU_SLOT,
];

export function phoneBarFor(signedIn: boolean): readonly PhoneBarSlot[] {
  return signedIn ? PHONE_BAR_SIGNED_IN : PHONE_BAR_GUEST;
}

/**
 * "You": the viewer's own things, shared by the avatar menu (SiteHeader)
 * and the phone Menu (MainOffcanvas). Signed in only. `/u/[handle]` is
 * filled in by {@link youItemHref}.
 *
 * My Reliability is not in the Structure A design, but the sidebar's old
 * Quick links were the only way into /me/reliability from the chrome, so
 * it stays here rather than leaving the page unreachable.
 */
export const YOU_ITEMS = [
  { id: "profile",     label: "My profile",     href: "/u/[handle]",       Icon: User },
  { id: "progression", label: "Standing",       href: "/me/progression",   Icon: TrendingUp },
  { id: "reliability", label: "My Reliability", href: "/me/reliability",   Icon: Activity },
  { id: "cases",       label: "My cases",       href: "/disputes",         Icon: Scale },
  { id: "settings",    label: "Settings",       href: "/u/me?tab=profile", Icon: Settings },
] as const;

export type YouItem = (typeof YOU_ITEMS)[number];

export function youItemHref(item: YouItem, handle: string): Route {
  return item.href.replace("[handle]", handle) as Route;
}

/**
 * "N open" beside My cases. `count` comes from useOpenCaseCount, which is
 * already null unless the server sent a whole number above zero. Status,
 * not a call to act: the copy stays a bare count.
 */
export function OpenCasesPill({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <span
      data-testid="open-cases-pill"
      className="bcc-mono ml-auto shrink-0 rounded-full border border-safety px-[7px] py-px text-[10px] font-normal normal-case tracking-[0.08em] text-bcc-text-safety"
    >
      {count} open
    </span>
  );
}

/** Footer legal links (always shown). */
export const LEGAL_LINKS = [
  { label: "Terms",   href: LEGAL_ROUTES.terms },
  { label: "Privacy", href: LEGAL_ROUTES.privacy },
  { label: "Cookies", href: LEGAL_ROUTES.cookies },
] as const;
