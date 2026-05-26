// Lightweight global language preference for bilingual link metadata.
//
// Stores the user's chosen UI language ('en' | 'bn') in localStorage under
// `km.lang` and notifies all `useLanguage()` callers when it changes — both
// within the same tab (via a tiny module-level pub/sub) and across tabs
// (via the native `storage` event).

import { useEffect, useState } from "react";
import type { LinkRow } from "@/lib/types";

export type Lang = "en" | "bn";

const STORAGE_KEY = "km.lang";

function readFromStorage(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

const listeners = new Set<(l: Lang) => void>();

export function useLanguage(): { lang: Lang; setLang: (l: Lang) => void } {
  // SSR-safe initial; reconciled on mount.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(readFromStorage());

    const onChange = (l: Lang) => setLangState(l);
    listeners.add(onChange);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next: Lang = e.newValue === "bn" ? "bn" : "en";
      listeners.forEach((fn) => fn(next));
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setLang = (l: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    listeners.forEach((fn) => fn(l));
  };

  return { lang, setLang };
}

type TitleSource = Pick<LinkRow, "title" | "title_bn" | "url"> & {
  domain: LinkRow["domain"];
};

export function pickTitle(link: TitleSource, lang: Lang): string {
  if (lang === "bn") {
    return link.title_bn?.trim() || link.title?.trim() || link.domain || link.url;
  }
  return link.title?.trim() || link.domain || link.url;
}

export function pickSummary(
  link: Pick<LinkRow, "summary" | "summary_bn">,
  lang: Lang,
): string | null {
  if (lang === "bn") return link.summary_bn?.trim() || link.summary?.trim() || null;
  return link.summary?.trim() || null;
}

/** Short label for the language switcher button. */
export const LANG_LABEL: Record<Lang, string> = {
  en: "EN",
  bn: "বাং",
};

export const LANG_NAME: Record<Lang, string> = {
  en: "English",
  bn: "Bangla",
};
