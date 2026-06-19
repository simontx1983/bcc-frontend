import { AppShell } from "@/components/layout/AppShell";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CelebrationGate } from "@/components/celebration/CelebrationGate";
import { MobileShell } from "@/components/layout/MobileShell";

export default function MainLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <AppShell>
        {children}
      </AppShell>
      {modal}
      <CelebrationGate />
      <MobileShell />
    </>
  );
}
