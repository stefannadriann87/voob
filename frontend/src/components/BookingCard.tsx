
export interface BookingCardProps {
  id: string;
  serviceName: string;
  businessName: string;
  date: string;
  paid: boolean;
  status?: "upcoming" | "completed" | "cancelled";
  showActions?: boolean;
  className?: string;
  onCancel?: (id: string) => void | Promise<void>;
  onReschedule?: (id: string) => void;
  onRequestCancel?: (id: string) => void;
  onDetails?: (id: string) => void;
  cancelling?: boolean;
}

export default function BookingCard({
  id,
  serviceName,
  businessName,
  date,
  paid,
  status = "upcoming",
  showActions = true,
  className,
  onCancel,
  onReschedule,
  onRequestCancel,
  onDetails,
  cancelling = false,
}: BookingCardProps) {
  const badgeColor =
    status === "completed" ? "bg-emerald-500/10 text-emerald-300" : status === "cancelled" ? "bg-red-500/10 text-red-300" : "bg-[#6366F1]/20 text-[#6366F1]";

  const isCompleted = status === "completed";

  return (
    <div
      className={`relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 text-white shadow-lg shadow-black/20 ${className ?? ""} ${isCompleted ? "overflow-hidden" : ""}`}
    >
      {isCompleted && (
        <div className="absolute inset-0 bg-emerald-500/20 pointer-events-none z-0" />
      )}
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{serviceName}</h3>
            <p className="text-sm text-white/60">{businessName}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeColor}`}>
            {status === "upcoming" ? "În desfășurare" : status === "completed" ? "Finalizată" : "Anulată"}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/70">
          <div className="flex items-center gap-2">
            <i className="fas fa-calendar" />
            <span>{new Date(date).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
          <div className="flex items-center gap-2">
            <i className={`fas ${paid ? "fa-check-circle text-emerald-400" : "fa-exclamation-circle text-amber-400"}`} />
            <span>{paid ? "Plătit" : "Plată la locație"}</span>
          </div>
        </div>

        {showActions && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isCompleted}
              onClick={() => onDetails?.(id)}
              className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${
                isCompleted
                  ? "cursor-not-allowed bg-white/5 text-white/40"
                  : "bg-[#6366F1] hover:bg-[#7C3AED]"
              }`}
            >
              Detalii
            </button>
            <button
              type="button"
              disabled={isCompleted}
              onClick={() => onReschedule?.(id)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                isCompleted
                  ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
                  : "border-white/10 text-white/80 hover:border-[#6366F1] hover:bg-[#6366F1]/20 hover:text-white"
              }`}
            >
              Reprogramează
            </button>
            <button
              type="button"
              disabled={cancelling || isCompleted}
              onClick={() => (onRequestCancel ? onRequestCancel(id) : onCancel?.(id))}
              className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                cancelling || isCompleted
                  ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
                  : "border-white/10 text-white/80 hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200"
              }`}
            >
              {cancelling ? "Se anulează..." : "Anulează"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

