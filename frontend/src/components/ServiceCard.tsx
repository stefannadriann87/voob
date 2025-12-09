interface ServiceCardProps {
  id: string;
  name: string;
  duration: number;
  price: number;
  onSelect?: (id: string) => void;
  selected?: boolean;
}

function formatDuration(duration: number): string {
  const hours = duration / 60;
  if (hours % 1 === 0) {
    // Ore întregi: 60min (1h), 120min (2h), etc.
    return `${duration}min (${hours}h)`;
  } else {
    // Ore cu zecimale: 90min (1.5h), 150min (2.5h), etc.
    return `${duration}min (${hours}h)`;
  }
}

export default function ServiceCard({
  id,
  name,
  duration,
  price,
  onSelect,
  selected = false,
}: ServiceCardProps) {
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
        <span className="text-sm font-medium text-[#6366F1]">
          {price.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-white/70">
        <i className="fas fa-clock" />
        <span>{formatDuration(duration)}</span>
      </div>
    </button>
  );
}

