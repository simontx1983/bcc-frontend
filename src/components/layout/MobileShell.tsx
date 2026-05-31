"use client";

import { useState } from "react";
import { MobileNav } from "@/components/layout/nav/MobileNav";
import { MainOffcanvas } from "@/components/layout/offcanvas/MainOffcanvas";

export function MobileShell() {
  const [offcanvasOpen, setOffcanvasOpen] = useState(false);

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