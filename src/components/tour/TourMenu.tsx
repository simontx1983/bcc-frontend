"use client";

/**
 * TourMenu — the "Show me around" entry point. A disclosure that lists
 * every registered tour so any of them can be launched on demand (the
 * surface-based auto-starts handle first-visit; this is the manual path,
 * and the only way to reach action-triggered tours like the composer /
 * rankchip explainers). Launching one closes the menu and starts it;
 * tours with a `route` navigate to the right surface first.
 */

import { useState } from "react";

import { useTour } from "@/components/tour/useTour";
import { tourRegistry } from "@/lib/tour/registry";

export function TourMenu() {
  const { start, definition } = useTour();
  const [open, setOpen] = useState(false);
  const tours = Object.values(tourRegistry);

  return (
    <div>
      <button
        type="button"
        className="bcc-nav-item"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: 12, width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
      >
        Take a tour {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", paddingLeft: 12 }}>
          {tours.map((tour) => (
            <button
              key={tour.id}
              type="button"
              className="bcc-nav-item"
              disabled={definition !== null}
              onClick={() => { setOpen(false); start(tour.id); }}
              style={{ fontSize: 11, width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", opacity: definition !== null ? 0.5 : 1 }}
            >
              · {tour.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
