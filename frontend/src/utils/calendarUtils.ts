/**
 * Calendar Utilities
 * Funcții comune pentru calendar logic folosite în multiple componente
 */

/**
 * Orele disponibile pentru rezervări (08:00 - 19:00)
 */
export const HOURS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
];

/**
 * Calculează data de început a săptămânii (luni) pentru o dată dată
 * @param date - Data pentru care se calculează începutul săptămânii
 * @returns Data de luni a săptămânii
 */
export const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Formatează o dată ca label pentru calendar (ex: "Lun 15")
 * @param date - Data de formatat
 * @returns String formatat
 */
export const formatDayLabel = (date: Date): string =>
  date.toLocaleDateString("ro-RO", { weekday: "short", day: "numeric" });

/**
 * Paleta de culori pentru clienți (15 culori vibrante)
 * Exclus roșu pentru a evita confuzia cu rezervările anulate
 */
export const CLIENT_COLORS = [
  { bg: "bg-blue-500/60", border: "border-blue-500/80", hover: "hover:bg-blue-500/70", shadow: "shadow-blue-500/40" },
  { bg: "bg-purple-500/60", border: "border-purple-500/80", hover: "hover:bg-purple-500/70", shadow: "shadow-purple-500/40" },
  { bg: "bg-pink-500/60", border: "border-pink-500/80", hover: "hover:bg-pink-500/70", shadow: "shadow-pink-500/40" },
  { bg: "bg-indigo-500/60", border: "border-indigo-500/80", hover: "hover:bg-indigo-500/70", shadow: "shadow-indigo-500/40" },
  { bg: "bg-cyan-500/60", border: "border-cyan-500/80", hover: "hover:bg-cyan-500/70", shadow: "shadow-cyan-500/40" },
  { bg: "bg-emerald-500/60", border: "border-emerald-500/80", hover: "hover:bg-emerald-500/70", shadow: "shadow-emerald-500/40" },
  { bg: "bg-teal-500/60", border: "border-teal-500/80", hover: "hover:bg-teal-500/70", shadow: "shadow-teal-500/40" },
  { bg: "bg-violet-500/60", border: "border-violet-500/80", hover: "hover:bg-violet-500/70", shadow: "shadow-violet-500/40" },
  { bg: "bg-fuchsia-500/60", border: "border-fuchsia-500/80", hover: "hover:bg-fuchsia-500/70", shadow: "shadow-fuchsia-500/40" },
  { bg: "bg-rose-500/60", border: "border-rose-500/80", hover: "hover:bg-rose-500/70", shadow: "shadow-rose-500/40" },
  { bg: "bg-amber-500/60", border: "border-amber-500/80", hover: "hover:bg-amber-500/70", shadow: "shadow-amber-500/40" },
  { bg: "bg-orange-500/60", border: "border-orange-500/80", hover: "hover:bg-orange-500/70", shadow: "shadow-orange-500/40" },
  { bg: "bg-lime-500/60", border: "border-lime-500/80", hover: "hover:bg-lime-500/70", shadow: "shadow-lime-500/40" },
  { bg: "bg-sky-500/60", border: "border-sky-500/80", hover: "hover:bg-sky-500/70", shadow: "shadow-sky-500/40" },
  { bg: "bg-yellow-500/60", border: "border-yellow-500/80", hover: "hover:bg-yellow-500/70", shadow: "shadow-yellow-500/40" },
] as const;

/**
 * Funcție hash simplă pentru a atribui consistent culori clienților
 * @param clientId - ID-ul clientului
 * @returns Obiect cu clase CSS pentru culoarea clientului
 */
export const getClientColor = (clientId: string): typeof CLIENT_COLORS[0] => {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CLIENT_COLORS.length;
  return CLIENT_COLORS[index];
};

