"use client";

import { useSyncExternalStore } from "react";
import { MobileNav } from "@/components/layout/nav/MobileNav";
import { MainOffcanvas } from "@/components/layout/offcanvas/MainOffcanvas";
import { getOffcanvasOpen, setOffcanvasOpen, subscribeOffcanvasOpen } from "@/lib/offcanvas-store";

export function MobileShell() {
  const offcanvasOpen = useSyncExternalStore(subscribeOffcanvasOpen, getOffcanvasOpen, () => false);

  return (
    <>
      <MobileNav onMenuOpen={() => setOffcanvasOpen(true)} />
      <MainOffcanvas
        open={offcanvasOpen}
        onClose={() => setOffcanvasOpen(false)}
      />
    </>
  );
}