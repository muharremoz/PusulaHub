import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, className, showLabel = false }: ProgressBarProps) {
  const color =
    value >= 95
      ? "bg-red-500"
      : value >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-1.5 bg-muted rounded-[5px] overflow-hidden">
        <div
          className={cn("h-full rounded-[5px] transition-all", color)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right">
          %{value}
        </span>
      )}
    </div>
  );
}
