import type { BusinessTypeValue } from "./businessTypes";

export type ConsentField =
  | {
      id: string;
      label: string;
      type: "checkbox";
      helperText?: string;
      required?: boolean;
    }
  | {
      id: string;
      label: string;
      type: "textarea";
      placeholder?: string;
      helperText?: string;
      required?: boolean;
    };

export type ConsentTemplate = {
  key: BusinessTypeValue;
  title: string;
  description: string;
  fields: ConsentField[];
};

export const CONSENT_TEMPLATES: Record<BusinessTypeValue, ConsentTemplate> = {
  GENERAL: {
    key: "GENERAL",
    title: "Acord general pentru servicii",
    description: "Confirmă că ai citit detaliile serviciului și ești de acord cu procesarea datelor personale.",
    fields: [
      {
        id: "general_consent",
        label: "Confirm că sunt de acord să continui cu serviciul solicitat.",
        type: "checkbox",
        required: true,
      },
      {
        id: "general_notes",
        label: "Observații / informații suplimentare",
        type: "textarea",
        placeholder: "Ex: tratamente urmate, alergii cunoscute",
      },
    ],
  },
  BEAUTY_WELLNESS: {
    key: "BEAUTY_WELLNESS",
    title: "Consimțământ servicii beauty & wellness",
    description: "Confirmă că ești de acord cu procedurile cosmetice și ai comunicat sensibilitățile cunoscute.",
    fields: [
      {
        id: "beauty_skin",
        label: "Confirm că nu am iritații, infecții sau alergii active în zona tratată.",
        type: "checkbox",
        required: true,
      },
      {
        id: "beauty_pregnant",
        label: "Declar că nu sunt însărcinată sau alăptez (dacă este cazul).",
        type: "checkbox",
      },
      {
        id: "beauty_products",
        label: "Produse cosmetice / tratamente folosite recent",
        type: "textarea",
        placeholder: "Ex: retinol, acid glicolic, tratamente laser",
      },
    ],
  },
  MEDICAL_DENTAL: {
    key: "MEDICAL_DENTAL",
    title: "Consimțământ tratament medical & dental",
    description: "Acest formular confirmă că pacientul înțelege procedurile medicale/dentale și riscurile asociate.",
    fields: [
      {
        id: "medical_risks",
        label: "Sunt de acord cu tratamentele propuse și am înțeles riscurile prezentate.",
        type: "checkbox",
        required: true,
      },
      {
        id: "medical_anesthesia",
        label: "Nu am alergii cunoscute la anestezice locale.",
        type: "checkbox",
      },
      {
        id: "medical_conditions",
        label: "Condiții medicale / tratamente în derulare",
        type: "textarea",
        placeholder: "Ex: diabet, tratament anticoagulant, sarcină etc.",
        helperText: "Completează dacă urmezi tratamente sau ai afecțiuni relevante.",
      },
    ],
  },
  THERAPY_COACHING: {
    key: "THERAPY_COACHING",
    title: "Consimțământ servicii terapie & coaching",
    description: "Confidențialitatea și acordul informat sunt esențiale pentru sesiunile de terapie și coaching.",
    fields: [
      {
        id: "therapy_confidentiality",
        label: "Înțeleg și sunt de acord cu regulile de confidențialitate explicate de specialist.",
        type: "checkbox",
        required: true,
      },
      {
        id: "therapy_emergency",
        label: "Am indicat contactul unei persoane apropiate pentru situații de urgență.",
        type: "checkbox",
      },
      {
        id: "therapy_goals",
        label: "Obiective / așteptări de la terapie/coaching",
        type: "textarea",
        placeholder: "Ex: gestionarea anxietății, suport emoțional, dezvoltare personală etc.",
      },
    ],
  },
  SPORT_OUTDOOR: {
    key: "SPORT_OUTDOOR",
    title: "Acord pentru activități sportive & outdoor",
    description: "Confirmă că ești apt pentru activitățile recomandate și că ai comunicat posibilele limitări.",
    fields: [
      {
        id: "sport_physical",
        label: "Sunt apt fizic pentru efort moderat și am comunicat eventualele restricții medicale.",
        type: "checkbox",
        required: true,
      },
      {
        id: "sport_implants",
        label: "Nu am implanturi / dispozitive medicale care să împiedice activitatea.",
        type: "checkbox",
      },
      {
        id: "sport_history",
        label: "Istoric de accidentări / intervenții chirurgicale",
        type: "textarea",
        placeholder: "Ex: fracturi, operații, dureri cronice",
      },
    ],
  },
  HOME_FREELANCE: {
    key: "HOME_FREELANCE",
    title: "Acord general pentru servicii la domiciliu",
    description: "Confirmă că ești de acord cu serviciile oferite și procesarea datelor personale.",
    fields: [
      {
        id: "home_consent",
        label: "Confirm că sunt de acord să continui cu serviciul solicitat.",
        type: "checkbox",
        required: true,
      },
      {
        id: "home_notes",
        label: "Observații / informații suplimentare",
        type: "textarea",
        placeholder: "Ex: acces la locație, instrucțiuni speciale",
      },
    ],
  },
};

export const CONSENT_REQUIRED_TYPES: BusinessTypeValue[] = ["MEDICAL_DENTAL", "THERAPY_COACHING"];

export const getConsentTemplate = (type?: BusinessTypeValue | null): ConsentTemplate => {
  if (!type) return CONSENT_TEMPLATES.GENERAL;
  return CONSENT_TEMPLATES[type] ?? CONSENT_TEMPLATES.GENERAL;
};

export const requiresConsentForBusiness = (type?: BusinessTypeValue | null) => {
  if (!type) return false;
  return CONSENT_REQUIRED_TYPES.includes(type);
};

