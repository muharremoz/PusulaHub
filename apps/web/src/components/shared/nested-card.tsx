import { cn } from "@/lib/utils";

interface NestedCardProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  innerClassName?: string;
}

export function NestedCard({ children, footer, className, innerClassName }: NestedCardProps) {
  return (
    <div
      className={cn("rounded-[8px] p-2", className)}
      style={{ backgroundColor: "var(--section-bg)" }}
    >
      <div
        className={cn("rounded-[5px] px-4 py-3", innerClassName)}
        style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}
      >
        {children}
      </div>
      {footer && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          {footer}
        </div>
      )}
    </div>
  );
}
