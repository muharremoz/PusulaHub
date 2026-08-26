import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export function StatsCard({ title, value, subtitle, icon, trend, className }: StatsCardProps) {
  return (
    <div
      className={cn("rounded-[8px] p-2 flex flex-col", className)}
      style={{ backgroundColor: "var(--section-bg)" }}
    >
      <div
        className="rounded-[5px] px-4 py-3 flex-1"
        style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium text-muted-foreground tracking-wide">
            {title}
          </p>
          {icon && (
            <div className="text-muted-foreground">{icon}</div>
          )}
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {trend && (
          <p className={cn(
            "text-[11px] mt-1",
            trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
          )}>
            {trend.value}
          </p>
        )}
      </div>
      {subtitle && (
        <div className="text-[11px] text-muted-foreground px-2 py-2">
          {subtitle}
        </div>
      )}
    </div>
  );
}
