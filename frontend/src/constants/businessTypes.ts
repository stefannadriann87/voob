export const BUSINESS_TYPE_OPTIONS = [
  { value: "GENERAL", label: "General" },
  { value: "BEAUTY_WELLNESS", label: "Beauty & Wellness" },
  { value: "MEDICAL_DENTAL", label: "Medical & Dental" },
  { value: "THERAPY_COACHING", label: "Therapy & Coaching" },
  { value: "SPORT_OUTDOOR", label: "Sport & Outdoor" },
  { value: "HOME_FREELANCE", label: "Home & Freelance Services" },
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPE_OPTIONS)[number]["value"];

