/**
 * Shared "© {year} Blue Collar Crypto" mark — used beside legal links
 * wherever they appear (LeftSidebar, MainOffcanvas, MinimalShell auth
 * footer, legal-doc footer). Plain text, not a link — the hover color
 * split is decorative, echoing the header .bcc-brand wordmark's two-tone
 * blue/orange, not an affordance.
 */
export function CopyrightMark() {
  const year = new Date().getFullYear();

  return (
    <span className="bcc-copyright">
      <span className="bcc-copyright-year">© {year}</span>{" "}
      <span className="bcc-copyright-collar">Blue Collar</span>{" "}
      <span className="bcc-copyright-crypto">Crypto</span>
    </span>
  );
}
