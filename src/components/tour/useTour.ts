"use client";

/**
 * useTour — consume the tour engine from anywhere under <TourProvider>.
 * Throws if used outside the provider so wiring mistakes fail loudly.
 */

import { useContext } from "react";

import { TourContext, type TourContextValue } from "@/components/tour/TourProvider";

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (ctx === null) {
    throw new Error("useTour must be used within <TourProvider>");
  }
  return ctx;
}
