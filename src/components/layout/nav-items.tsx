import {
  BadgeCheck,
  Globe,
  GraduationCap,
  Home,
  Landmark,
  LayoutGrid,
  MessageSquare,
  Scale,
  Users,
} from "lucide-react";

import { WatchIcon } from "@/components/icons/registry";
import { LEGAL_ROUTES } from "@/lib/legal/config";

/**
 * Canonical site navigation — the SINGLE source of truth for the desktop
 * LeftSidebar and the mobile MainOffcanvas. Add, remove, or reorder a
 * top-level destination HERE, once.
 *
 * History: these three lists were previously duplicated verbatim in both
 * LeftSidebar and MainOffcanvas, plus a third, tiered copy in a
 * `nav-config` module whose only consumers (SiteFooter / MobileMenuSheet /
 * OpsMenu / HeaderRail) were never rendered — so edits to it (e.g. the
 * first attempt to surface Halls) had no effect. That dead cluster was
 * deleted and both live navs now import from here.
 *
 * Icons are pre-rendered nodes so every consumer draws them identically;
 * MainOffcanvas renders the label only and ignores `icon`. Kept `as const`
 * so `href` stays a literal route type for typedRoutes-checked `<Link href>`
 * (LeftSidebar passes `item.href` straight through, no cast).
 */
export const PRIMARY_NAV = [
  { label: "Home",        href: "/",            icon: <Home size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Halls",       href: "/halls",       icon: <Landmark size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Members",     href: "/members",     icon: <Users size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Directory",   href: "/directory",   icon: <LayoutGrid size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Communities", href: "/communities", icon: <Globe size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Messages",    href: "/messages",    icon: <MessageSquare size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Disputes",    href: "/disputes",    icon: <Scale size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Watching",    href: "/watching",    icon: <WatchIcon size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Validators",  href: "/validators",  icon: <BadgeCheck size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Mentors",     href: "/mentors",     icon: <GraduationCap size={20} strokeWidth={1.7} aria-hidden /> },
] as const;

/** Viewer-scoped shortcuts (authed only). */
export const QUICK_LINKS = [
  { label: "My Progression", href: "/me/progression" },
  { label: "My Reliability",  href: "/me/reliability"  },
  { label: "Settings",        href: "/u/me?tab=profile" },
] as const;

/** Footer legal links (always shown). */
export const LEGAL_LINKS = [
  { label: "Terms",   href: LEGAL_ROUTES.terms },
  { label: "Privacy", href: LEGAL_ROUTES.privacy },
  { label: "Cookies", href: LEGAL_ROUTES.cookies },
] as const;

export type NavItem = (typeof PRIMARY_NAV)[number];
