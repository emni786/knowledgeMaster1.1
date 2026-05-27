import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LANG_NAME, useLanguage, type LangPref } from "@/lib/i18n";

interface LanguageToggleProps {
  /** Visual variant: pill (default) or icon-only for compact toolbars. */
  variant?: "pill" | "icon";
  className?: string;
}

/**
 * Global Source / Bangla switcher. A single click toggles between the two
 * states — there is no dropdown / popover, just an immediate flip. `auto`
 * (the default state) means each link is shown in its detected source
 * language; `bn` forces the entire app to Bangla. Force-English is
 * intentionally not exposed here: if you want EN on a Bangla page you can
 * flip it locally inside the detail panel.
 *
 * Persists to localStorage via `useLanguage` and broadcasts to every other
 * component that uses the hook.
 */
export function LanguageToggle({ variant = "pill", className }: LanguageToggleProps) {
  const { lang, setLang } = useLanguage();

  // "en" is no longer reachable from this control, but we still respect a
  // saved "en" preference by treating it as "auto" for the purposes of the
  // toggle's visual state — clicking the icon will then flip them to BN.
  const isBangla = lang === "bn";
  const next: LangPref = isBangla ? "auto" : "bn";
  const tooltip = isBangla
    ? `Bangla — click to show source language`
    : `${LANG_NAME[lang === "en" ? "auto" : lang]} — click to switch to Bangla`;

  if (variant === "icon") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`relative h-9 w-9 hover:bg-primary/10 hover:text-primary ${isBangla ? "text-primary" : ""} ${className ?? ""}`}
            aria-label={tooltip}
            aria-pressed={isBangla}
            onClick={() => setLang(next)}
          >
            <Languages className="h-4 w-4" />
            <span
              className={`absolute -bottom-0.5 -right-0.5 rounded-md px-1 font-mono text-[9px] leading-[12px] shadow-sm ${isBangla ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              aria-hidden="true"
            >
              {isBangla ? "বাং" : "src"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
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
        onClick={() => setLang("auto")}
        aria-pressed={!isBangla}
        className={`px-2.5 py-1 rounded-full transition ${
          !isBangla
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Source
      </button>
      <button
        type="button"
        onClick={() => setLang("bn")}
        aria-pressed={isBangla}
        className={`px-2.5 py-1 rounded-full transition ${
          isBangla
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        বাং
      </button>
    </div>
  );
}
