export function MinimalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bcc-minimal-shell">
      {children}
      <footer className="bcc-auth-footer">
        <span>© 2026 Blue Collar Crypto</span>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
      </footer>
    </div>
  );
}