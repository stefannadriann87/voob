"use client";

import Link from "next/link";

export default function AuthHeader() {
  return (
    <header className="auth-header">
      <div className="auth-header-container">
        <Link href="/" className="auth-header-logo">
          <div className="logo">VOOB</div>
          <div className="logo-motto">Timpul tău, organizat perfect!</div>
        </Link>
      </div>
    </header>
  );
}

