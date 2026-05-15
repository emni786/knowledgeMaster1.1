import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PageTab<T extends string = string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
};

export function PageTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: PageTab<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-1 border-b border-border/60 -mx-2 px-2 overflow-x-auto",
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            <span>{t.label}</span>
            {t.badge != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums leading-none",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {t.badge}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
