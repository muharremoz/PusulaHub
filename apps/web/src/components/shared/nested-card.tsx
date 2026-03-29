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
      className={cn("rounded-[8px] p-2 pb-0", className)}
      style={{ backgroundColor: "#F4F2F0" }}
    >
      <div
        className={cn("rounded-[4px] px-4 py-3", innerClassName)}
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        {children}
      </div>
      {footer && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          {footer}
        </div>
      )}
      {!footer && <div className="h-2" />}
    </div>
  );
}
