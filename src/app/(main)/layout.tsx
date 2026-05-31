import { getServerSession } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

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

  return (
    <SessionProvider session={session}>
      <SiteHeader />
      <AppShell>
        {children}
      </AppShell>
      <CelebrationGate />
      <MobileShell />
      <SpeedInsights />
    </SessionProvider>
  );
}
