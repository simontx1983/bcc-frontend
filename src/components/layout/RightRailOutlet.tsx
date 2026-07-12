"use client";

/**
 * RightRailOutlet — renders the default `RightSidebar`, or the post rail
 * when a page has registered post context via `useRegisterRightRail`.
 * Kept separate from the context module so the context has no dependency
 * on the (heavier) sidebar components.
 */

import { PostRightRail } from "@/components/layout/PostRightRail";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { useRightRail } from "@/components/layout/RightRailContext";

export function RightRailOutlet() {
  const data = useRightRail();
  return data !== null ? <PostRightRail {...data} /> : <RightSidebar />;
}
