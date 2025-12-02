"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCookieConsent, type CookiePreferences } from "../hooks/useCookieConsent";

export default function CookieBanner() {
  const { hasConsent, isLoading, acceptAll, rejectAll, saveCustomPreferences, preferences } = useCookieConsent();
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && hasConsent === false) {
      // Așteaptă puțin pentru animație
      setTimeout(() => setShowBanner(true), 300);
    }
  }, [hasConsent, isLoading]);

  const handleAcceptAll = () => {
    acceptAll();
    setShowBanner(false);
  };

  const handleRejectAll = () => {
    rejectAll();
    setShowBanner(false);
  };

  const handleSavePreferences = (newPreferences: Partial<CookiePreferences>) => {
    saveCustomPreferences(newPreferences);
    setShowSettings(false);
    setShowBanner(false);
  };

  if (isLoading || hasConsent !== false) {
    return null;
  }

  if (!showBanner) {
    return null;
  }

  return (
    <>
      {/* Overlay pentru blur efect */}
      <div
        className={`cookie-banner-overlay ${showBanner ? "active" : ""}`}
        onClick={() => setShowBanner(false)}
      />

      {/* Banner principal */}
      <div className={`cookie-banner ${showBanner ? "active" : ""}`}>
        <div className="cookie-banner-content">
          <div className="cookie-banner-header">
            <div className="cookie-banner-icon">
              <i className="fas fa-cookie-bite"></i>
            </div>
            <h3>Folosim cookie-uri</h3>
          </div>

          <p className="cookie-banner-text">
            Utilizăm cookie-uri pentru a îmbunătăți experiența dumneavoastră, pentru analiză și pentru personalizare.
            Cookie-urile esențiale sunt necesare pentru funcționarea site-ului și nu pot fi dezactivate.
          </p>

          <div className="cookie-banner-links">
            <button
              type="button"
              className="cookie-link"
              onClick={() => {
                setShowBanner(false);
                router.push("/legal/politica-cookies");
              }}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              Află mai multe
            </button>
            <button
              type="button"
              className="cookie-settings-btn"
              onClick={() => setShowSettings(true)}
            >
              Setări avansate
            </button>
          </div>

          <div className="cookie-banner-actions">
            <button
              type="button"
              className="cookie-btn cookie-btn-reject"
              onClick={handleRejectAll}
            >
              Respinge toate
            </button>
            <button
              type="button"
              className="cookie-btn cookie-btn-accept"
              onClick={handleAcceptAll}
            >
              Acceptă toate
            </button>
          </div>
        </div>
      </div>

      {/* Modal pentru setări avansate */}
      {showSettings && (
        <CookieSettingsModal
          preferences={preferences}
          onSave={handleSavePreferences}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

interface CookieSettingsModalProps {
  preferences: CookiePreferences;
  onSave: (prefs: Partial<CookiePreferences>) => void;
  onClose: () => void;
}

function CookieSettingsModal({ preferences, onSave, onClose }: CookieSettingsModalProps) {
  const [localPreferences, setLocalPreferences] = useState<CookiePreferences>(preferences);
  const router = useRouter();

  const handleToggle = (category: keyof CookiePreferences) => {
    if (category === "essential") return; // Nu poate fi dezactivat
    setLocalPreferences((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleSave = () => {
    onSave(localPreferences);
  };

  const handleReadPolicy = () => {
    onClose();
    router.push("/legal/politica-cookies");
  };

  return (
    <div className="cookie-settings-overlay" onClick={onClose}>
      <div className="cookie-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cookie-settings-header">
          <h3>Preferințe Cookie-uri</h3>
          <button type="button" className="cookie-settings-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="cookie-settings-content">
          <p className="cookie-settings-intro">
            Selectează ce tipuri de cookie-uri vrei să accepti. Cookie-urile esențiale sunt necesare
            pentru funcționarea site-ului și nu pot fi dezactivate.
          </p>

          {/* Essential Cookies - Always enabled */}
          <div className="cookie-category">
            <div className="cookie-category-header">
              <div>
                <h4>Cookie-uri Esențiale</h4>
                <p className="cookie-category-desc">
                  Necesare pentru funcționarea site-ului. Nu pot fi dezactivate.
                </p>
              </div>
              <label className="cookie-toggle">
                <input type="checkbox" checked={true} disabled />
                <span className="cookie-toggle-slider"></span>
              </label>
            </div>
          </div>

          {/* Functional Cookies */}
          <div className="cookie-category">
            <div className="cookie-category-header">
              <div>
                <h4>Cookie-uri Funcționale</h4>
                <p className="cookie-category-desc">
                  Permit site-ului să ofere funcționalități și personalizare îmbunătățite.
                </p>
              </div>
              <label className="cookie-toggle">
                <input
                  type="checkbox"
                  checked={localPreferences.functional}
                  onChange={() => handleToggle("functional")}
                />
                <span className="cookie-toggle-slider"></span>
              </label>
            </div>
          </div>

          {/* Analytics Cookies */}
          <div className="cookie-category">
            <div className="cookie-category-header">
              <div>
                <h4>Cookie-uri de Analiză</h4>
                <p className="cookie-category-desc">
                  Ne ajută să înțelegem cum utilizați site-ul pentru a îmbunătăți experiența.
                </p>
              </div>
              <label className="cookie-toggle">
                <input
                  type="checkbox"
                  checked={localPreferences.analytics}
                  onChange={() => handleToggle("analytics")}
                />
                <span className="cookie-toggle-slider"></span>
              </label>
            </div>
          </div>

          {/* Marketing Cookies */}
          <div className="cookie-category">
            <div className="cookie-category-header">
              <div>
                <h4>Cookie-uri de Marketing</h4>
                <p className="cookie-category-desc">
                  Folosite pentru a vă arăta anunțuri relevante și pentru a măsura eficacitatea
                  campaniilor.
                </p>
              </div>
              <label className="cookie-toggle">
                <input
                  type="checkbox"
                  checked={localPreferences.marketing}
                  onChange={() => handleToggle("marketing")}
                />
                <span className="cookie-toggle-slider"></span>
              </label>
            </div>
          </div>

          <div className="cookie-settings-footer">
            <button
              type="button"
              className="cookie-link"
              onClick={handleReadPolicy}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
            >
              Citește Politica Cookies
            </button>
            <div className="cookie-settings-actions">
              <button type="button" className="cookie-btn cookie-btn-secondary" onClick={onClose}>
                Anulează
              </button>
              <button type="button" className="cookie-btn cookie-btn-accept" onClick={handleSave}>
                Salvează preferințele
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

