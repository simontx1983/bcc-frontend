/**
 * /welcome — the guest landing page (Direction A "LEDGER"). Placeholder
 * during the Item 7 route-group split; the real FloorIntro rebuild lands
 * in the next pass (handover Item 1). Anon `/` rewrites here via
 * middleware; authed `/` renders the (app) feed instead.
 */
export default function WelcomePage() {
  return (
    <main className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6">
      <h1 className="bcc-stencil text-3xl text-[var(--bcc-text)]">
        Reputation you can&apos;t buy.
      </h1>
      <p className="mt-3 max-w-xl font-serif text-[var(--bcc-text-secondary)]">
        Blue Collar Crypto is on-chain reputation, earned in public — not sponsored,
        not boosted, not bought.
      </p>
    </main>
  );
}
