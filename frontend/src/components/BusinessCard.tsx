interface BusinessCardProps {
  id: string;
  name: string;
  domain: string;
  description?: string;
  note?: string;
  services?: number;
  onSelect?: (id: string) => void;
  selected?: boolean;
}

export default function BusinessCard({
  id,
  name,
  description,
  note,
  services,
  onSelect,
  selected = false,
}: BusinessCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(id)}
      className={`w-full rounded-2xl border desktop:px-5 desktop:py-4 px-3 py-3 text-left transition focus:outline-none ${
        selected
          ? "border-[#6366F1] bg-[#6366F1]/10"
          : "border-white/10 bg-white/5 hover:border-[#6366F1]/60"
      }`}
    >
      <div className="flex items-center justify-between text-sm text-white/50">
        {/* <span className="uppercase tracking-wide">{domain}</span> */}
        {services !== undefined && (
          <span className="flex items-center gap-2 text-white/60">
            <i className="fas fa-briefcase" />
            {services} servicii
          </span>
        )}
      </div>
      <h3 className="mt-2 text-lg font-semibold text-white">{name}</h3>
      {description && <p className="mt-2 text-sm text-white/70">{description}</p>}
      {note && <p className="mt-3 text-sm font-medium text-pink-400">{note}</p>}
    </button>
  );
}

