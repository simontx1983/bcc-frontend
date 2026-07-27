"use client";

/**
 * TourAutoStart — a render-null island that fires a contextual tour on
 * first visit to the surface it's dropped into. Lets a server-component
 * page opt a tour in without becoming a client component itself:
 *
 *   <TourAutoStart tourId="home-feed" />
 *
 * All the "don't nag" guards live in useAutoStartTour.
 */

import { useAutoStartTour } from "@/hooks/useAutoStartTour";

export function TourAutoStart({ tourId, enabled = true }: { tourId: string; enabled?: boolean }) {
  useAutoStartTour(tourId, enabled);
  return null;
}
