"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCookieConsent, type CookiePreferences } from "../hooks/useCookieConsent";

export default function CookiePreferencesButton() {
  const { hasConsent, preferences, saveCustomPreferences } = useCookieConsent();
  const [showModal, setShowModal] = useState(false);

  if (!hasConsent) {
    return null; // Nu arăta butonul dacă nu s-a dat consimțământ
  }

  const handleSave = (newPreferences: Partial<CookiePreferences>) => {
    saveCustomPreferences(newPreferences);
    setShowModal(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="cookie-preferences-btn"
        style={{
          background: "transparent",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          color: "rgba(255, 255, 255, 0.7)",
          padding: "8px 16px",
          borderRadius: "6px",
          fontSize: "13px",
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
        }}
      >
        <i className="fas fa-cog" style={{ marginRight: "6px" }}></i>
        Preferințe Cookie-uri
      </button>

      {showModal && (
        <CookieSettingsModal
          preferences={preferences}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
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

