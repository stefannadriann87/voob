export const BUSINESS_TYPE_OPTIONS = [
  { value: "GENERAL", label: "General" },
  { value: "STOMATOLOGIE", label: "Cabinet stomatologic" },
  { value: "BEAUTY", label: "Beauty & hair" },
  { value: "OFTALMOLOGIE", label: "Oftalmologie" },
  { value: "PSIHOLOGIE", label: "Psihologie" },
  { value: "TERAPIE", label: "Terapie / recuperare" },
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPE_OPTIONS)[number]["value"];

