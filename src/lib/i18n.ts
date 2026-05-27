// Lightweight global language preference for bilingual link metadata.
//
// Stores the user's chosen UI language ('en' | 'bn') in localStorage under
// `km.lang` and notifies all `useLanguage()` callers when it changes — both
// within the same tab (via a tiny module-level pub/sub) and across tabs
// (via the native `storage` event).

import { useEffect, useState } from "react";
import type { LinkRow, SourceLang } from "@/lib/types";

export type Lang = "en" | "bn";
/** User-facing language preference. `auto` defers to each link's source_lang. */
export type LangPref = Lang | "auto";

const STORAGE_KEY = "km.lang";

function readFromStorage(): LangPref {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "bn" || v === "en" || v === "auto") return v;
    return "auto";
  } catch {
    return "auto";
  }
}

const listeners = new Set<(l: LangPref) => void>();

export function useLanguage(): { lang: LangPref; setLang: (l: LangPref) => void } {
  // SSR-safe initial; reconciled on mount.
  const [lang, setLangState] = useState<LangPref>("auto");

  useEffect(() => {
    setLangState(readFromStorage());

    const onChange = (l: LangPref) => setLangState(l);
    listeners.add(onChange);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next: LangPref =
        e.newValue === "bn" || e.newValue === "en" || e.newValue === "auto"
          ? (e.newValue as LangPref)
          : "auto";
      listeners.forEach((fn) => fn(next));
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setLang = (l: LangPref) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    listeners.forEach((fn) => fn(l));
  };

  return { lang, setLang };
}

/** Resolve a user preference to a concrete language for a given link. */
export function resolveLang(pref: LangPref, sourceLang: SourceLang | null | undefined): Lang {
  if (pref === "en" || pref === "bn") return pref;
  // 'auto' — follow the link's detected source language. Fall back to English
  // so legacy rows (saved before source_lang existed) behave as before.
  return sourceLang === "bn" ? "bn" : "en";
}

type TitleSource = Pick<LinkRow, "title" | "title_bn" | "url"> & {
  domain: LinkRow["domain"];
  source_lang?: LinkRow["source_lang"];
};

/**
 * Pick the title to display. Accepts either a concrete `Lang` or a `LangPref`
 * — when given `auto`, the link's `source_lang` decides which field is
 * canonical (with a graceful fall-back if that field is empty).
 */
export function pickTitle(link: TitleSource, pref: LangPref): string {
  const lang = resolveLang(pref, link.source_lang);
  if (lang === "bn") {
    return link.title_bn?.trim() || link.title?.trim() || link.domain || link.url;
  }
  return link.title?.trim() || link.title_bn?.trim() || link.domain || link.url;
}

export function pickSummary(
  link: Pick<LinkRow, "summary" | "summary_bn"> & {
    source_lang?: LinkRow["source_lang"];
  },
  pref: LangPref,
): string | null {
  const lang = resolveLang(pref, link.source_lang);
  if (lang === "bn") return link.summary_bn?.trim() || link.summary?.trim() || null;
  return link.summary?.trim() || link.summary_bn?.trim() || null;
}

/** Short label for the language switcher button. */
export const LANG_LABEL: Record<LangPref, string> = {
  auto: "Auto",
  en: "EN",
  bn: "বাং",
};

export const LANG_NAME: Record<LangPref, string> = {
  auto: "Auto (source)",
  en: "English",
  bn: "Bangla",
};
