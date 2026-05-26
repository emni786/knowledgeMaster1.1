import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LANG_NAME, useLanguage, type Lang } from "@/lib/i18n";

interface LanguageToggleProps {
  /** Visual variant: pill (default) or icon-only for compact toolbars. */
  variant?: "pill" | "icon";
  className?: string;
}

/**
 * Global EN / বাং switcher. Persists to localStorage via `useLanguage`
 * and broadcasts to every other component that uses the hook.
 */
export function LanguageToggle({ variant = "pill", className }: LanguageToggleProps) {
  const { lang, setLang } = useLanguage();
  const next: Lang = lang === "en" ? "bn" : "en";

  if (variant === "icon") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 hover:bg-primary/10 hover:text-primary ${className ?? ""}`}
            onClick={() => setLang(next)}
            aria-label={`Switch to ${LANG_NAME[next]}`}
          >
            <Languages className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Switch to {LANG_NAME[next]}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      className={`inline-flex items-center rounded-full border border-border/60 bg-background p-0.5 text-[11px] font-mono ${className ?? ""}`}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`px-2.5 py-1 rounded-full transition ${
          lang === "en"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("bn")}
        aria-pressed={lang === "bn"}
        className={`px-2.5 py-1 rounded-full transition ${
          lang === "bn"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        বাং
      </button>
    </div>
  );
}
