interface ServiceCardProps {
  id: string;
  name: string;
  duration: number;
  price: number;
  onSelect?: (id: string) => void;
  selected?: boolean;
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
      className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
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
        <span>{duration} min</span>
      </div>
    </button>
  );
}

