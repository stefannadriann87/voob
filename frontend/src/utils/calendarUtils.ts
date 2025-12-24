/**
 * Calendar Utilities
 * Funcții comune pentru calendar logic folosite în multiple componente
 */

/**
 * Generează orele default disponibile pentru rezervări (08:00 - 19:00)
 * Folosit ca fallback când working hours nu sunt configurate
 * @param slotDurationMinutes - Durata sloturilor în minute (default: 60)
 * @returns Array de string-uri cu orele (ex: ["08:00", "09:00", ...])
 */
export function getDefaultHours(slotDurationMinutes: number = 60): string[] {
  const hours: string[] = [];
  const startHour = 8;
  const endHour = 19;
  
  let currentHour = startHour;
  let currentMinute = 0;
  
  while (currentHour < endHour || (currentHour === endHour && currentMinute === 0)) {
    const hourStr = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
    hours.push(hourStr);
    
    currentMinute += slotDurationMinutes;
    if (currentMinute >= 60) {
      currentMinute = 0;
      currentHour += 1;
    }
  }
  
  return hours;
}

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
 * Paleta de culori optimizată pentru clienți (12 culori distincte)
 * Exclus roșu pentru a evita confuzia cu rezervările anulate
 * Eliminat cyan, sky, teal (prea similare cu blue/emerald)
 * Opacity diferențiată bazată pe luminozitatea culorii pentru contrast optim
 * Include clase pentru gradient-uri și hover states
 */
export const CLIENT_COLORS = [
  // Culori închise - opacity mai mare pentru contrast
  { 
    bg: "bg-blue-500/80", 
    border: "border-blue-500/90", 
    hover: "hover:bg-blue-500/85", 
    shadow: "shadow-blue-500/40",
    gradientFirst: "bg-gradient-to-r from-blue-500/85 via-blue-500/80 to-blue-500/75",
    gradientHover: "hover:from-blue-500/90 hover:via-blue-500/85 hover:to-blue-500/80",
    gradientMiddle: "bg-gradient-to-r from-blue-500/80 via-blue-500/75 to-blue-500/70",
    hoverBg: "bg-blue-500/95",
    hoverGradientFirst: "bg-gradient-to-r from-blue-500/95 via-blue-500/90 to-blue-500/85",
  },
  { 
    bg: "bg-purple-500/80", 
    border: "border-purple-500/90", 
    hover: "hover:bg-purple-500/85", 
    shadow: "shadow-purple-500/40",
    gradientFirst: "bg-gradient-to-r from-purple-500/85 via-purple-500/80 to-purple-500/75",
    gradientHover: "hover:from-purple-500/90 hover:via-purple-500/85 hover:to-purple-500/80",
    gradientMiddle: "bg-gradient-to-r from-purple-500/80 via-purple-500/75 to-purple-500/70",
    hoverBg: "bg-purple-500/95",
    hoverGradientFirst: "bg-gradient-to-r from-purple-500/95 via-purple-500/90 to-purple-500/85",
  },
  { 
    bg: "bg-indigo-500/80", 
    border: "border-indigo-500/90",
    hover: "hover:bg-indigo-500/85", 
    shadow: "shadow-indigo-500/40",
    gradientFirst: "bg-gradient-to-r from-indigo-500/85 via-indigo-500/80 to-indigo-500/75",
    gradientHover: "hover:from-indigo-500/90 hover:via-indigo-500/85 hover:to-indigo-500/80",
    gradientMiddle: "bg-gradient-to-r from-indigo-500/80 via-indigo-500/75 to-indigo-500/70",
    hoverBg: "bg-indigo-500/95",
    hoverGradientFirst: "bg-gradient-to-r from-indigo-500/95 via-indigo-500/90 to-indigo-500/85",
  },
  { 
    bg: "bg-violet-500/80", 
    border: "border-violet-500/90", 
    hover: "hover:bg-violet-500/85", 
    shadow: "shadow-violet-500/40",
    gradientFirst: "bg-gradient-to-r from-violet-500/85 via-violet-500/80 to-violet-500/75",
    gradientHover: "hover:from-violet-500/90 hover:via-violet-500/85 hover:to-violet-500/80",
    gradientMiddle: "bg-gradient-to-r from-violet-500/80 via-violet-500/75 to-violet-500/70",
    hoverBg: "bg-violet-500/95",
    hoverGradientFirst: "bg-gradient-to-r from-violet-500/95 via-violet-500/90 to-violet-500/85",
  },
  { 
    bg: "bg-emerald-500/75", 
    border: "border-emerald-500/85", 
    hover: "hover:bg-emerald-500/80", 
    shadow: "shadow-emerald-500/40",
    gradientFirst: "bg-gradient-to-r from-emerald-500/80 via-emerald-500/75 to-emerald-500/70",
    gradientHover: "hover:from-emerald-500/85 hover:via-emerald-500/80 hover:to-emerald-500/75",
    gradientMiddle: "bg-gradient-to-r from-emerald-500/75 via-emerald-500/70 to-emerald-500/65",
    hoverBg: "bg-emerald-500/90",
    hoverGradientFirst: "bg-gradient-to-r from-emerald-500/90 via-emerald-500/85 to-emerald-500/80",
  },
  // Culori medii - opacity mediu
  { 
    bg: "bg-pink-500/70", 
    border: "border-pink-500/80", 
    hover: "hover:bg-pink-500/75", 
    shadow: "shadow-pink-500/40",
    gradientFirst: "bg-gradient-to-r from-pink-500/75 via-pink-500/70 to-pink-500/65",
    gradientHover: "hover:from-pink-500/80 hover:via-pink-500/75 hover:to-pink-500/70",
    gradientMiddle: "bg-gradient-to-r from-pink-500/70 via-pink-500/65 to-pink-500/60",
    hoverBg: "bg-pink-500/85",
    hoverGradientFirst: "bg-gradient-to-r from-pink-500/85 via-pink-500/80 to-pink-500/75",
  },
  { 
    bg: "bg-fuchsia-500/70", 
    border: "border-fuchsia-500/80", 
    hover: "hover:bg-fuchsia-500/75", 
    shadow: "shadow-fuchsia-500/40",
    gradientFirst: "bg-gradient-to-r from-fuchsia-500/75 via-fuchsia-500/70 to-fuchsia-500/65",
    gradientHover: "hover:from-fuchsia-500/80 hover:via-fuchsia-500/75 hover:to-fuchsia-500/70",
    gradientMiddle: "bg-gradient-to-r from-fuchsia-500/70 via-fuchsia-500/65 to-fuchsia-500/60",
    hoverBg: "bg-fuchsia-500/85",
    hoverGradientFirst: "bg-gradient-to-r from-fuchsia-500/85 via-fuchsia-500/80 to-fuchsia-500/75",
  },
  { 
    bg: "bg-rose-500/70", 
    border: "border-rose-500/80", 
    hover: "hover:bg-rose-500/75", 
    shadow: "shadow-rose-500/40",
    gradientFirst: "bg-gradient-to-r from-rose-500/75 via-rose-500/70 to-rose-500/65",
    gradientHover: "hover:from-rose-500/80 hover:via-rose-500/75 hover:to-rose-500/70",
    gradientMiddle: "bg-gradient-to-r from-rose-500/70 via-rose-500/65 to-rose-500/60",
    hoverBg: "bg-rose-500/85",
    hoverGradientFirst: "bg-gradient-to-r from-rose-500/85 via-rose-500/80 to-rose-500/75",
  },
  // Culori deschise - opacity mai mic pentru a nu fi prea stridente
  { 
    bg: "bg-amber-500/60", 
    border: "border-amber-500/70", 
    hover: "hover:bg-amber-500/65", 
    shadow: "shadow-amber-500/40",
    gradientFirst: "bg-gradient-to-r from-amber-500/65 via-amber-500/60 to-amber-500/55",
    gradientHover: "hover:from-amber-500/70 hover:via-amber-500/65 hover:to-amber-500/60",
    gradientMiddle: "bg-gradient-to-r from-amber-500/60 via-amber-500/55 to-amber-500/50",
    hoverBg: "bg-amber-500/75",
    hoverGradientFirst: "bg-gradient-to-r from-amber-500/75 via-amber-500/70 to-amber-500/65",
  },
  { 
    bg: "bg-orange-500/60", 
    border: "border-orange-500/70", 
    hover: "hover:bg-orange-500/65", 
    shadow: "shadow-orange-500/40",
    gradientFirst: "bg-gradient-to-r from-orange-500/65 via-orange-500/60 to-orange-500/55",
    gradientHover: "hover:from-orange-500/70 hover:via-orange-500/65 hover:to-orange-500/60",
    gradientMiddle: "bg-gradient-to-r from-orange-500/60 via-orange-500/55 to-orange-500/50",
    hoverBg: "bg-orange-500/75",
    hoverGradientFirst: "bg-gradient-to-r from-orange-500/75 via-orange-500/70 to-orange-500/65",
  },
  { 
    bg: "bg-lime-500/60", 
    border: "border-lime-500/70", 
    hover: "hover:bg-lime-500/65", 
    shadow: "shadow-lime-500/40",
    gradientFirst: "bg-gradient-to-r from-lime-500/65 via-lime-500/60 to-lime-500/55",
    gradientHover: "hover:from-lime-500/70 hover:via-lime-500/65 hover:to-lime-500/60",
    gradientMiddle: "bg-gradient-to-r from-lime-500/60 via-lime-500/55 to-lime-500/50",
    hoverBg: "bg-lime-500/75",
    hoverGradientFirst: "bg-gradient-to-r from-lime-500/75 via-lime-500/70 to-lime-500/65",
  },
  { 
    bg: "bg-yellow-500/60", 
    border: "border-yellow-500/70", 
    hover: "hover:bg-yellow-500/65", 
    shadow: "shadow-yellow-500/40",
    gradientFirst: "bg-gradient-to-r from-yellow-500/65 via-yellow-500/60 to-yellow-500/55",
    gradientHover: "hover:from-yellow-500/70 hover:via-yellow-500/65 hover:to-yellow-500/60",
    gradientMiddle: "bg-gradient-to-r from-yellow-500/60 via-yellow-500/55 to-yellow-500/50",
    hoverBg: "bg-yellow-500/75",
    hoverGradientFirst: "bg-gradient-to-r from-yellow-500/75 via-yellow-500/70 to-yellow-500/65",
  },
] as const;

/**
 * Funcție hash simplă pentru a atribui consistent culori clienților
 * @param clientId - ID-ul clientului
 * @returns Obiect cu clase CSS pentru culoarea clientului
 */
export const getClientColor = (clientId: string): (typeof CLIENT_COLORS)[number] => {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CLIENT_COLORS.length;
  return CLIENT_COLORS[index];
};
