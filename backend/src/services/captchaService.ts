/**
 * CAPTCHA Service
 * Gestionează verificarea reCAPTCHA v3
 */

import axios from "axios";

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

interface CaptchaVerificationResult {
  success: boolean;
  score: number;
  action: string;
  error?: string;
}

/**
 * Verifică token-ul reCAPTCHA v3
 * @param token - Token-ul de la frontend
 * @param ip - IP-ul clientului (opțional, dar recomandat)
 * @returns Rezultatul verificării cu score (0.0 - 1.0)
 */
export async function verifyCaptcha(
  token: string,
  ip?: string
): Promise<CaptchaVerificationResult> {
  if (!RECAPTCHA_SECRET_KEY) {
    console.warn("RECAPTCHA_SECRET_KEY nu este configurat. CAPTCHA verificare va eșua.");
    // În development, dacă nu e configurat, permitem (pentru testare)
    if (process.env.NODE_ENV === "development") {
      return {
        success: true,
        score: 0.9,
        action: "register",
      };
    }
    return {
      success: false,
      score: 0,
      action: "unknown",
      error: "CAPTCHA nu este configurat",
    };
  }

  if (!token) {
    return {
      success: false,
      score: 0,
      action: "unknown",
      error: "Token CAPTCHA lipsă",
    };
  }

  try {
    const response = await axios.post(RECAPTCHA_VERIFY_URL, null, {
      params: {
        secret: RECAPTCHA_SECRET_KEY,
        response: token,
        remoteip: ip,
      },
      timeout: 5000,
    });

    const data = response.data;

    if (!data.success) {
      return {
        success: false,
        score: 0,
        action: data.action || "unknown",
        error: data["error-codes"]?.join(", ") || "Verificare CAPTCHA eșuată",
      };
    }

    // Score 0.0 = bot, 1.0 = human
    // Threshold recomandat: < 0.5 = bot, >= 0.5 = human
    const score = data.score || 0;

    return {
      success: true,
      score,
      action: data.action || "unknown",
    };
  } catch (error: any) {
    console.error("CAPTCHA verification error:", error);
    return {
      success: false,
      score: 0,
      action: "unknown",
      error: error.message || "Eroare la verificarea CAPTCHA",
    };
  }
}

/**
 * Verifică dacă score-ul CAPTCHA este acceptabil
 * @param score - Score-ul de la reCAPTCHA (0.0 - 1.0)
 * @param threshold - Threshold minim (default 0.5)
 * @returns true dacă score >= threshold
 */
export function isCaptchaScoreValid(score: number, threshold: number = 0.5): boolean {
  return score >= threshold;
}

module.exports = {
  verifyCaptcha,
  isCaptchaScoreValid,
};

