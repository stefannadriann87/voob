"use client";

import { useState, useEffect } from "react";

export type CookieCategory = "essential" | "functional" | "analytics" | "marketing";

export interface CookiePreferences {
  essential: boolean; // Mereu true, nu poate fi dezactivat
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

const COOKIE_CONSENT_KEY = "voob_cookie_consent";
const COOKIE_PREFERENCES_KEY = "voob_cookie_preferences";

export function useCookieConsent() {
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true,
    functional: false,
    analytics: false,
    marketing: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Verifică dacă există consimțământ salvat
    if (typeof window !== "undefined") {
      const savedConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
      const savedPreferences = localStorage.getItem(COOKIE_PREFERENCES_KEY);

      if (savedConsent === "true") {
        setHasConsent(true);
        if (savedPreferences) {
          try {
            const parsed = JSON.parse(savedPreferences);
            setPreferences({
              essential: true, // Mereu true
              functional: parsed.functional ?? false,
              analytics: parsed.analytics ?? false,
              marketing: parsed.marketing ?? false,
            });
          } catch {
            // Dacă nu se poate parsa, folosește default
          }
        }
      } else {
        setHasConsent(false);
      }
      setIsLoading(false);
    }
  }, []);

  const acceptAll = () => {
    const newPreferences: CookiePreferences = {
      essential: true,
      functional: true,
      analytics: true,
      marketing: true,
    };
    saveConsent(true, newPreferences);
  };

  const rejectAll = () => {
    const newPreferences: CookiePreferences = {
      essential: true,
      functional: false,
      analytics: false,
      marketing: false,
    };
    saveConsent(true, newPreferences);
  };

  const saveCustomPreferences = (newPreferences: Partial<CookiePreferences>) => {
    const updatedPreferences: CookiePreferences = {
      essential: true, // Mereu true
      functional: newPreferences.functional ?? preferences.functional,
      analytics: newPreferences.analytics ?? preferences.analytics,
      marketing: newPreferences.marketing ?? preferences.marketing,
    };
    saveConsent(true, updatedPreferences);
  };

  const saveConsent = (consent: boolean, prefs: CookiePreferences) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(COOKIE_CONSENT_KEY, consent.toString());
      localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(prefs));
      setHasConsent(consent);
      setPreferences(prefs);
    }
  };

  const resetConsent = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(COOKIE_CONSENT_KEY);
      localStorage.removeItem(COOKIE_PREFERENCES_KEY);
      setHasConsent(false);
      setPreferences({
        essential: true,
        functional: false,
        analytics: false,
        marketing: false,
      });
    }
  };

  const isCategoryEnabled = (category: CookieCategory): boolean => {
    return preferences[category] ?? false;
  };

  return {
    hasConsent,
    preferences,
    isLoading,
    acceptAll,
    rejectAll,
    saveCustomPreferences,
    resetConsent,
    isCategoryEnabled,
  };
}

