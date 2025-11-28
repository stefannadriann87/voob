/**
 * CUI/CIF Validator pentru România
 * Validează CUI-ul folosind algoritmul de verificare standard
 */

/**
 * Validează CUI-ul românesc folosind algoritmul de verificare
 * CUI-ul are 2-10 cifre, ultima cifră este cifra de control
 */
function validateCUI(cui: string): { valid: boolean; error?: string } {
  if (!cui) {
    return { valid: false, error: "CUI-ul este obligatoriu." };
  }

  // Elimină spații și caractere non-numerice
  const cleaned = cui.replace(/\s/g, "").replace(/\D/g, "");

  // Verifică că conține doar cifre
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, error: "CUI-ul trebuie să conțină doar cifre." };
  }

  // Verifică lungimea (CUI-ul are între 2 și 10 cifre)
  if (cleaned.length < 2 || cleaned.length > 10) {
    return { valid: false, error: "CUI-ul trebuie să aibă între 2 și 10 cifre." };
  }

  // Algoritm de verificare CUI
  const digits = cleaned.split("").map(Number);
  const checkDigit = digits[digits.length - 1];
  const numberWithoutCheck = digits.slice(0, -1);

  // Constanta de verificare
  const multiplier = [7, 5, 3, 2, 1, 7, 5, 3, 2];
  let sum = 0;

  // Calculăm suma ponderată
  for (let i = 0; i < numberWithoutCheck.length; i++) {
    const multiplierIndex = i % multiplier.length;
    const digit = numberWithoutCheck[i] ?? 0;
    const weight = multiplier[multiplierIndex] ?? 0;
    sum += digit * weight;
  }

  // Calculăm cifra de control
  const remainder = sum % 11;
  let calculatedCheckDigit: number;

  if (remainder < 10) {
    calculatedCheckDigit = remainder;
  } else {
    calculatedCheckDigit = 0;
  }

  // Verificăm dacă cifra de control este corectă
  if (calculatedCheckDigit !== checkDigit) {
    return { valid: false, error: "CUI-ul nu are cifra de verificare corectă." };
  }

  return { valid: true };
}

/**
 * Formatează CUI-ul pentru afișare (adaugă spații dacă e necesar)
 */
function formatCUI(cui: string): string {
  const cleaned = cui.replace(/\s/g, "").replace(/\D/g, "");
  // Nu formatăm CUI-ul, îl returnăm așa cum este
  return cleaned;
}

module.exports = {
  validateCUI,
  formatCUI,
};

