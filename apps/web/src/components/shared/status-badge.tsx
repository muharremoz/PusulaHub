import { cn } from "@/lib/utils";

type StatusVariant = "online" | "warning" | "offline" | "info" | "success" | "error" | "critical" | "Started" | "Stopped" | "Online" | "Offline" | "Restoring";

const variantStyles: Record<string, string> = {
  online: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25/60",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25/60",
  Started: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25/60",
  Online: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25/60",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25/60",
  offline: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25/60",
  error: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25/60",
  critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25/60",
  Stopped: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25/60",
  Offline: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25/60",
  Restoring: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25/60",
  info: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25/60",
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
        variantStyles[status] || "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/25/60",
        className
      )}
    >
      {label || variantLabels[status] || status}
    </span>
  );
}
