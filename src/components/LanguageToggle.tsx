import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LANG_NAME, useLanguage, type LangPref } from "@/lib/i18n";

interface LanguageToggleProps {
  /** Visual variant: pill (default) or icon-only for compact toolbars. */
  variant?: "pill" | "icon";
  className?: string;
}

const ORDER: LangPref[] = ["auto", "en", "bn"];

/**
 * Global Auto / EN / বাং switcher. Persists to localStorage via `useLanguage`
 * and broadcasts to every other component that uses the hook. `auto` (the
 * default) means each link is shown in its detected source language; `en` and
 * `bn` force the entire app to that language.
 */
export function LanguageToggle({ variant = "pill", className }: LanguageToggleProps) {
  const { lang, setLang } = useLanguage();

  if (variant === "icon") {
    return (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-9 w-9 hover:bg-primary/10 hover:text-primary ${className ?? ""}`}
                aria-label={`Language: ${LANG_NAME[lang]}`}
              >
                <Languages className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Language</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="font-mono text-xs">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Display language
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as LangPref)}>
            {ORDER.map((opt) => (
              <DropdownMenuRadioItem key={opt} value={opt}>
                {LANG_NAME[opt]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div
      className={`inline-flex items-center rounded-full border border-border/60 bg-background p-0.5 text-[11px] font-mono ${className ?? ""}`}
      role="group"
      aria-label="Language"
    >
      {ORDER.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => setLang(opt)}
          aria-pressed={lang === opt}
          className={`px-2.5 py-1 rounded-full transition ${
            lang === opt
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt === "auto" ? "Auto" : opt === "en" ? "EN" : "বাং"}
        </button>
      ))}
    </div>
  );
}
