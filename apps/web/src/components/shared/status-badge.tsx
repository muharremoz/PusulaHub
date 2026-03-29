import { cn } from "@/lib/utils";

type StatusVariant = "online" | "warning" | "offline" | "info" | "success" | "error" | "critical" | "Started" | "Stopped" | "Online" | "Offline" | "Restoring";

const variantStyles: Record<string, string> = {
  online: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  Started: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  Online: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  warning: "bg-amber-50 text-amber-700 border-amber-200/60",
  offline: "bg-red-50 text-red-700 border-red-200/60",
  error: "bg-red-50 text-red-700 border-red-200/60",
  critical: "bg-red-50 text-red-700 border-red-200/60",
  Stopped: "bg-red-50 text-red-700 border-red-200/60",
  Offline: "bg-red-50 text-red-700 border-red-200/60",
  Restoring: "bg-blue-50 text-blue-700 border-blue-200/60",
  info: "bg-blue-50 text-blue-700 border-blue-200/60",
};

const variantLabels: Record<string, string> = {
  online: "Aktif",
  warning: "Uyari",
  offline: "Kapali",
  success: "Basarili",
  error: "Hata",
  critical: "Kritik",
  info: "Bilgi",
  Started: "Calisiyor",
  Stopped: "Durmus",
  Online: "Online",
  Offline: "Offline",
  Restoring: "Geri Yukleniyor",
};

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[5px] border px-2.5 py-0.5 text-[10px] font-medium",
        variantStyles[status] || "bg-gray-50 text-gray-700 border-gray-200/60",
        className
      )}
    >
      {label || variantLabels[status] || status}
    </span>
  );
}
