"use client";

import { useEffect, useRef } from "react";

interface CaptchaProps {
  onVerify: (token: string) => void;
  action?: string;
}

declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

/**
 * Componentă CAPTCHA invizibilă (reCAPTCHA v3)
 * Implementare manuală fără dependențe React specifice
 */
export default function Captcha({ onVerify, action = "register" }: CaptchaProps) {
  const scriptLoaded = useRef(false);
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

  useEffect(() => {
    if (!siteKey) {
      console.warn("NEXT_PUBLIC_RECAPTCHA_SITE_KEY nu este configurat");
      return;
    }

    // Încarcă script-ul Google reCAPTCHA dacă nu e deja încărcat
    const loadScript = () => {
      if (scriptLoaded.current || document.querySelector('script[src*="recaptcha"]')) {
        scriptLoaded.current = true;
        executeCaptcha();
        return;
      }

      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        scriptLoaded.current = true;
        executeCaptcha();
      };
      script.onerror = () => {
        console.error("Failed to load reCAPTCHA script");
      };
      document.head.appendChild(script);
    };

    const executeCaptcha = () => {
      if (!window.grecaptcha || !window.grecaptcha.ready) {
        console.warn("reCAPTCHA nu este încărcat");
        return;
      }

      window.grecaptcha.ready(async () => {
        try {
          const token = await window.grecaptcha.execute(siteKey, { action });
          if (token) {
            onVerify(token);
          }
        } catch (error) {
          console.error("Error executing reCAPTCHA:", error);
        }
      });
    };

    // Încarcă script-ul
    loadScript();

    // Re-execută la fiecare 2 minute (token-urile expiră după ~2 minute)
    const interval = setInterval(() => {
      if (scriptLoaded.current) {
        executeCaptcha();
      }
    }, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, [siteKey, action, onVerify]);

  // Componentă invizibilă (nu afișează nimic)
  return null;
}

