import { Sparkles } from "lucide-react";

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground ${className}`}
      style={{ width: size, height: size }}
    >
      <Sparkles className="h-1/2 w-1/2" strokeWidth={2.5} />
    </div>
  );
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Logo />
      {!collapsed && (
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-sm font-semibold tracking-tight">Xenonowledge</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">link librarian</span>
        </div>
      )}
    </div>
  );
}
