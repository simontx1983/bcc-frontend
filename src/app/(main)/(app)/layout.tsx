import { AppShell } from "@/components/layout/AppShell";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CelebrationGate } from "@/components/celebration/CelebrationGate";
import { MobileShell } from "@/components/layout/MobileShell";

// TourProvider is mounted inside AppShell (co-located with the sidebar that
// consumes it), so every surface rendering the shell — (app) AND (detail) —
// gets the tour context. That's why it isn't wrapped here.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <AppShell>
        {children}
      </AppShell>
      <CelebrationGate />
      <MobileShell />
    </>
  );
}
