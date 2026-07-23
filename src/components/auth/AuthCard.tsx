"use client";

import { Moon, Sun } from "lucide-react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { applyTheme, getStoredAccent, getStoredTheme, type Accent, type Theme } from "@/lib/theme";

interface AuthCardProps {
  heading: string;
  subheading?: string | undefined;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthCard({ heading, subheading, children, footer }: AuthCardProps) {
  const [theme, setTheme] = useState<Theme>("dark");
  // No accent switcher on auth pages (kept simple by design) — this only
  // mirrors the globally-saved accent so buttons/links here follow whatever
  // the user picked elsewhere, instead of always rendering the primary hue.
  const [accent, setAccent] = useState<Accent>("primary");

  useEffect(() => {
    const t = getStoredTheme();
    const a = getStoredAccent();
    setTheme(t);
    setAccent(a);
    applyTheme(t, a);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next, accent);
  }, [theme, accent]);

  return (
    <div className="bcc-auth-card">
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="bcc-auth-theme-toggle"
        aria-label="Toggle theme"
        type="button"
      >
        {theme === "dark" ? (
          <Sun size={16} strokeWidth={2} aria-hidden />
        ) : (
          <Moon size={16} strokeWidth={2} aria-hidden />
        )}
      </button>

      {/* Logo */}
      <Link href="/" className="bcc-auth-logo" aria-label="Blue Collar Crypto home">
        <Image
          src="/images/Blue_Collar_Crypto_Logo.png"
          alt="Blue Collar Crypto"
          width={40}
          height={40}
          className="bcc-auth-logo-img"
          priority
        />
      </Link>

      {/* Heading */}
      <div className="bcc-auth-heading-group">
        <h1 className="bcc-auth-heading">{heading}</h1>
        {subheading && <p className="bcc-auth-subheading">{subheading}</p>}
      </div>

      {/* Form content slot */}
      <div className="bcc-auth-body">{children}</div>

      {/* Footer link slot */}
      {footer && <div className="bcc-auth-card-footer">{footer}</div>}
    </div>
  );
}

// ─── SSO Buttons ─────────────────────────────────────────────────────────────

interface SSOButtonProps {
  provider: "google" | "twitter";
  mode: "login" | "signup";
  /** Where NextAuth redirects after successful OAuth sign-in (existing users only). */
  callbackUrl?: string;
}

export function SSOButton({ provider, mode, callbackUrl = "/onboarding" }: SSOButtonProps) {
  const label = mode === "login" ? "Continue with" : "Sign up with";
  const name  = provider === "google" ? "Google" : "X";

  const providerId = provider === "twitter" ? "twitter" : "google";

  return (
    <button
      type="button"
      className="bcc-sso-btn"
      onClick={() => { void signIn(providerId, { callbackUrl }); }}
    >
      <span className="bcc-sso-icon">
        {provider === "google" ? <GoogleIcon /> : <TwitterIcon />}
      </span>
      <span className="bcc-sso-label">
        {label} {name}
      </span>
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      {/* Google's brand palette — exact hex is required by their brand
          guidelines; not a BCC token. color-token-guard:allow — Google logo */}
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/> {/* color-token-guard:allow — Google brand */}
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/> {/* color-token-guard:allow — Google brand */}
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/> {/* color-token-guard:allow — Google brand */}
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/> {/* color-token-guard:allow — Google brand */}
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function AuthDivider() {
  return (
    <div className="bcc-auth-divider">
      <span className="bcc-auth-divider-line" />
      <span className="bcc-auth-divider-text">or</span>
      <span className="bcc-auth-divider-line" />
    </div>
  );
}