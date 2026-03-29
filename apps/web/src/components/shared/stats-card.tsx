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
      className={cn("rounded-[8px] p-2 pb-0 flex flex-col", className)}
      style={{ backgroundColor: "#F4F2F0" }}
    >
      <div
        className="rounded-[4px] px-4 py-3 flex-1"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
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
            trend.positive ? "text-emerald-600" : "text-destructive"
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
      {!subtitle && <div className="h-2" />}
    </div>
  );
}
