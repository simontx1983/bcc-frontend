import { AppShell } from "@/components/layout/AppShell";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CelebrationGate } from "@/components/celebration/CelebrationGate";
import { MobileShell } from "@/components/layout/MobileShell";
import { PostQuickViewProvider } from "@/components/feed/PostQuickViewProvider";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PostQuickViewProvider>
      <SiteHeader />
      <AppShell>
        {children}
      </AppShell>
      <CelebrationGate />
      <MobileShell />
    </PostQuickViewProvider>
  );
}
