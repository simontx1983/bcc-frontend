import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CelebrationGate } from "@/components/celebration/CelebrationGate";
import { MobileShell } from "@/components/layout/MobileShell";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const viewerHandle = session?.user.handle ?? null;

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