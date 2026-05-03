"use client";

/**
 * DisputesRoom — /disputes top-level surface.
 *
 * Composes both flows of the §D5 dispute system on one page:
 *   - PANEL DUTY  → <PanelDutyList>   (the juror's incoming queue)
 *   - MY DISPUTES → <MyDisputesList>  (filed by me, page-owner outbox)
 *
 * The participation strip lives above the tabs so trust progress is
 * visible regardless of which tab the viewer lands on. Tab state is
 * stored in URL searchParams (`?tab=panel|filed`) so a refresh keeps
 * the viewer where they were and a tab is shareable as a deep link.
 *
 * /panel still mounts the bare PanelDutyList (its dedicated header is
 * tighter than this tabbed view); both surfaces share the underlying
 * data fetch via the React Query cache.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import {
  PanelDutyList,
  ParticipationStrip,
} from "@/components/disputes/PanelQueue";
import { MyDisputesList } from "@/components/disputes/MyDisputesList";
import { useMyParticipation } from "@/hooks/useDisputes";

type TabKey = "panel" | "filed";
const VALID_TABS: readonly TabKey[] = ["panel", "filed"] as const;
const DEFAULT_TAB: TabKey = "panel";

export function DisputesRoom() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const participation = useMyParticipation();

  const tab: TabKey = useMemo(() => {
    const raw = searchParams.get("tab");
    return VALID_TABS.includes(raw as TabKey) ? (raw as TabKey) : DEFAULT_TAB;
  }, [searchParams]);

  const setTab = (next: TabKey): void => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs !== "" ? `/disputes?${qs}` : "/disputes", {
      scroll: false,
    });
  };

  return (
    <main className="mx-auto max-w-[1200px] px-7 pb-24 pt-12">
      <div className="border-b border-dashed border-cardstock/15 pb-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; DISPUTES</span>
        </span>
      </div>

      <header className="mt-10">
        <p className="bcc-mono text-safety">DISPUTE ROOM</p>
        <h1
          className="bcc-stencil mt-2 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.25rem, 5.5vw, 4.5rem)" }}
        >
          Cases on, cases out.
        </h1>
        <p className="mt-3 max-w-2xl font-serif leading-relaxed text-cardstock-deep">
          Two queues live here. <strong>Panel duty</strong> is what the floor
          needs from you &mdash; downvotes other owners are challenging.{" "}
          <strong>My disputes</strong> is your own outbox &mdash; downvotes you
          have challenged on your pages, and how the panel ruled.
        </p>
      </header>

      {participation.data !== undefined && (
        <ParticipationStrip participation={participation.data} />
      )}

      <TabBar tab={tab} setTab={setTab} />

      <div className="mt-8">
        {tab === "panel" && <PanelDutyList />}
        {tab === "filed" && <MyDisputesList />}
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TabBar — two-tab switcher with a stencil-style active indicator.
// Keyboard: arrow-left/right rotate; tab order matches DOM order.
// ─────────────────────────────────────────────────────────────────────

function TabBar({
  tab,
  setTab,
}: {
  tab: TabKey;
  setTab: (next: TabKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Dispute room tabs"
      className="mt-8 flex gap-6 border-b border-dashed border-cardstock/15"
    >
      <TabButton
        active={tab === "panel"}
        onClick={() => setTab("panel")}
        label="PANEL DUTY"
      />
      <TabButton
        active={tab === "filed"}
        onClick={() => setTab("filed")}
        label="MY DISPUTES"
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="bcc-mono group relative -mb-px pb-3 pt-2 text-[12px] tracking-[0.2em] transition"
      style={{
        color: active ? "var(--safety)" : "var(--cardstock-deep)",
      }}
    >
      {label}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-[-1px] h-[2px] transition"
        style={{
          background: active ? "var(--safety)" : "transparent",
        }}
      />
    </button>
  );
}
