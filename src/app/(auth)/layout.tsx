import { MinimalShell } from "@/components/layout/shells/MinimalShell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <MinimalShell>{children}</MinimalShell>;
}