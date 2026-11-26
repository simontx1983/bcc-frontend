import { LEGAL } from "@/lib/legal/config";

export function CopyrightReportLink({
  path,
  item,
}: {
  path: string;
  item: string;
}) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(path, LEGAL.siteUrl);
  } catch {
    return null;
  }
  if (url.origin !== LEGAL.siteUrl) return null;

  const subject = encodeURIComponent("Copyright concern");
  const body = encodeURIComponent(
    `Location: ${url.origin}${url.pathname}\nItem: ${item}\n\nPlease describe the work and explain your concern.\n`,
  );

  return (
    <a
      href={`mailto:${LEGAL.legalEmail}?subject=${subject}&body=${body}`}
      className="bcc-mono inline-flex min-h-11 items-center text-[11px] text-bcc-text-secondary underline underline-offset-2"
    >
      Report a copyright concern
    </a>
  );
}
