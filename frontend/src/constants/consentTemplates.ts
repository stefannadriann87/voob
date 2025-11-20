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
  STOMATOLOGIE: {
    key: "STOMATOLOGIE",
    title: "Consimțământ tratament stomatologic",
    description: "Acest formular confirmă că pacientul înțelege procedurile stomatologice și riscurile asociate.",
    fields: [
      {
        id: "stoma_risks",
        label: "Sunt de acord cu tratamentele propuse și am înțeles riscurile prezentate.",
        type: "checkbox",
        required: true,
      },
      {
        id: "stoma_anesthesia",
        label: "Nu am alergii cunoscute la anestezice locale.",
        type: "checkbox",
      },
      {
        id: "stoma_conditions",
        label: "Condiții medicale / tratamente în derulare",
        type: "textarea",
        placeholder: "Ex: diabet, tratament anticoagulant, sarcină etc.",
        helperText: "Completează dacă urmezi tratamente sau ai afecțiuni relevante.",
      },
    ],
  },
  BEAUTY: {
    key: "BEAUTY",
    title: "Consimțământ servicii beauty",
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
  OFTALMOLOGIE: {
    key: "OFTALMOLOGIE",
    title: "Consimțământ consultație oftalmologică",
    description: "Confirmă că ești informat despre testele efectuate și îți asumi comunicarea istoricului medical.",
    fields: [
      {
        id: "ophtha_consent",
        label: "Sunt de acord cu efectuarea testelor oftalmologice recomandate.",
        type: "checkbox",
        required: true,
      },
      {
        id: "ophtha_conditions",
        label: "Afecțiuni oculare / intervenții anterioare",
        type: "textarea",
        placeholder: "Ex: glaucom, operație laser, cataractă",
      },
      {
        id: "ophtha_medication",
        label: "Tratament medicamentos curent",
        type: "textarea",
        placeholder: "Ex: picături, tratament pentru tensiune oculară",
      },
    ],
  },
  PSIHOLOGIE: {
    key: "PSIHOLOGIE",
    title: "Consimțământ servicii psihologice",
    description: "Confidențialitatea și acordul informat sunt esențiale pentru sesiunile de psihoterapie.",
    fields: [
      {
        id: "psy_confidentiality",
        label: "Înțeleg și sunt de acord cu regulile de confidențialitate explicate de specialist.",
        type: "checkbox",
        required: true,
      },
      {
        id: "psy_emergency",
        label: "Am indicat contactul unei persoane apropiate pentru situații de urgență.",
        type: "checkbox",
      },
      {
        id: "psy_goals",
        label: "Obiective / așteptări de la terapie",
        type: "textarea",
        placeholder: "Ex: gestionarea anxietății, suport emoțional etc.",
      },
    ],
  },
  TERAPIE: {
    key: "TERAPIE",
    title: "Consimțământ terapie / recuperare",
    description: "Confirmă că ești apt pentru exercițiile recomandate și că ai comunicat posibilele limitări.",
    fields: [
      {
        id: "therapy_physical",
        label: "Sunt apt fizic pentru efort moderat și am comunicat eventualele restricții medicale.",
        type: "checkbox",
        required: true,
      },
      {
        id: "therapy_implants",
        label: "Nu am implanturi / dispozitive medicale care să împiedice terapia.",
        type: "checkbox",
      },
      {
        id: "therapy_history",
        label: "Istoric de accidentări / intervenții chirurgicale",
        type: "textarea",
        placeholder: "Ex: fracturi, operații, dureri cronice",
      },
    ],
  },
};

export const CONSENT_REQUIRED_TYPES: BusinessTypeValue[] = [
  "STOMATOLOGIE",
  "BEAUTY",
  "OFTALMOLOGIE",
  "PSIHOLOGIE",
  "TERAPIE",
];

export const getConsentTemplate = (type?: BusinessTypeValue | null): ConsentTemplate => {
  if (!type) return CONSENT_TEMPLATES.GENERAL;
  return CONSENT_TEMPLATES[type] ?? CONSENT_TEMPLATES.GENERAL;
};

export const requiresConsentForBusiness = (type?: BusinessTypeValue | null) => {
  if (!type) return false;
  return CONSENT_REQUIRED_TYPES.includes(type);
};

