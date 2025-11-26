/**
 * IBAN Validator pentru România
 * Validează formatul IBAN românesc conform standardului ISO 13616
 */

/**
 * Validează formatul IBAN românesc
 * Format: RO + 2 cifre verificare + 4 litere BIC + 16 caractere alfanumerice
 * Exemplu: RO49 AAAA 1B31 0075 9384 0000
 */
export function validateIBAN(iban: string): { valid: boolean; error?: string } {
  if (!iban) {
    return { valid: false, error: "IBAN-ul este obligatoriu." };
  }

  // Elimină spații și convertește la uppercase
  const cleaned = iban.replace(/\s/g, "").toUpperCase();

  // Verifică că începe cu RO
  if (!cleaned.startsWith("RO")) {
    return { valid: false, error: "IBAN-ul trebuie să înceapă cu 'RO' pentru România." };
  }

  // Verifică lungimea (RO = 2, check digits = 2, BIC = 4, account = 16, total = 24)
  if (cleaned.length !== 24) {
    return { valid: false, error: "IBAN-ul românesc trebuie să aibă exact 24 de caractere." };
  }

  // Verifică formatul: RO + 2 cifre + 4 litere + 16 alfanumerice
  const ibanRegex = /^RO\d{2}[A-Z]{4}[A-Z0-9]{16}$/;
  if (!ibanRegex.test(cleaned)) {
    return {
      valid: false,
      error: "Format IBAN invalid. Format așteptat: RO49 AAAA 1B31 0075 9384 0000",
    };
  }

  // Validare check digits folosind algoritmul MOD-97-10
  const checkDigits = cleaned.substring(2, 4);
  const accountPart = cleaned.substring(4);
  const rearranged = accountPart + "RO" + checkDigits;

  // Convertim literele în cifre (A=10, B=11, ..., Z=35)
  let numericString = "";
  for (const char of rearranged) {
    if (char >= "A" && char <= "Z") {
      numericString += (char.charCodeAt(0) - 55).toString();
    } else {
      numericString += char;
    }
  }

  // Calculăm MOD 97
  let remainder = "";
  for (let i = 0; i < numericString.length; i++) {
    remainder = (remainder + numericString[i]).replace(/^0+/, "");
    if (remainder.length < 9) {
      continue;
    }
    remainder = (parseInt(remainder) % 97).toString();
  }

  const modResult = parseInt(remainder) % 97;
  if (modResult !== 1) {
    return { valid: false, error: "IBAN-ul nu are cifrele de verificare corecte." };
  }

  return { valid: true };
}

/**
 * Formatează IBAN-ul pentru afișare (adaugă spații)
 * RO49AAAA1B31007593840000 -> RO49 AAAA 1B31 0075 9384 0000
 */
export function formatIBAN(iban: string): string {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (cleaned.length !== 24) {
    return iban; // Returnează original dacă nu e valid
  }
  return `${cleaned.substring(0, 4)} ${cleaned.substring(4, 8)} ${cleaned.substring(8, 12)} ${cleaned.substring(12, 16)} ${cleaned.substring(16, 20)} ${cleaned.substring(20, 24)}`;
}

/**
 * Verifică dacă IBAN-ul aparține unei entități legale
 * (Verificare simplă - în producție ar trebui să verifici cu banca)
 */
export function validateIBANOwnership(
  iban: string,
  legalEntityName: string
): { valid: boolean; error?: string } {
  const ibanValidation = validateIBAN(iban);
  if (!ibanValidation.valid) {
    return ibanValidation;
  }

  // Normalizează numele pentru comparație
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();

  const normalizedEntityName = normalize(legalEntityName);
  const normalizedIBAN = normalize(iban);

  // Verificare simplă - în producție ar trebui să verifici cu serviciul bancar
  // Aici doar verificăm că numele nu este gol
  if (!normalizedEntityName || normalizedEntityName.length < 3) {
    return { valid: false, error: "Numele entității legale este prea scurt." };
  }

  // Notă: Verificarea reală a proprietății IBAN-ului ar trebui făcută prin:
  // 1. API bancar (dacă disponibil)
  // 2. Verificare manuală de către admin
  // 3. Verificare prin Stripe Connect (când se creează contul)

  return { valid: true };
}

module.exports = {
  validateIBAN,
  formatIBAN,
  validateIBANOwnership,
};

