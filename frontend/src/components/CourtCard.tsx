interface CourtCardProps {
  id: string;
  name: string;
  number: number;
  pricing?: Array<{
    timeSlot: "MORNING" | "AFTERNOON" | "NIGHT";
    price: number;
    startHour: number;
    endHour: number;
  }>;
  onSelect?: (id: string) => void;
  selected?: boolean;
}

export default function CourtCard({
  id,
  name,
  number,
  pricing,
  onSelect,
  selected = false,
}: CourtCardProps) {
  // Calculează intervalul de prețuri
  const priceRange = pricing && pricing.length > 0
    ? {
        min: Math.min(...pricing.map((p) => p.price)),
        max: Math.max(...pricing.map((p) => p.price)),
      }
    : null;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(id)}
      className={`w-full rounded-2xl border px-3 py-3 desktop:px-5 desktop:py-4 text-left transition ${
        selected
          ? "border-[#6366F1] bg-[#6366F1]/15 text-white"
          : "border-white/10 bg-white/5 text-white hover:border-[#6366F1]/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold">{name}</h4>
        {priceRange && (
          <span className="text-sm font-medium text-[#6366F1]">
            {priceRange.min === priceRange.max
              ? priceRange.min.toLocaleString("ro-RO", { style: "currency", currency: "RON" })
              : `${priceRange.min.toLocaleString("ro-RO", { style: "currency", currency: "RON" })} - ${priceRange.max.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}`}
            <span className="text-xs text-white/60">/oră</span>
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-white/70">
        <i className="fas fa-map-marker-alt" />
        <span>Teren {number}</span>
      </div>
    </button>
  );
}

