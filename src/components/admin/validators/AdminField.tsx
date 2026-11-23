/**
 * AdminField — one labelled value in a validator admin row's `<dl>`.
 * Mono micro-label over the value; `wide` spans both columns from `sm`.
 */

export interface AdminFieldProps {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}

export function AdminField({ label, wide = false, children }: AdminFieldProps) {
  return (
    <div className={"flex min-w-0 flex-col gap-1" + (wide ? " sm:col-span-2" : "")}>
      <dt className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary">
        {label.toUpperCase()}
      </dt>
      <dd className="min-w-0 text-sm text-bcc-text">{children}</dd>
    </div>
  );
}
