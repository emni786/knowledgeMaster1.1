// Reminder + notification helpers.
//
// The library lets users attach a "remind me later" timestamp to any link.
// When that timestamp passes we want the app to nudge the user — both
// visually (toast + bell-icon badge) and, if they granted permission, with
// a real desktop notification — so the link doesn't quietly rot in the pile.
//
// The watcher runs whenever an authenticated route is mounted (regardless of
// which page they're on) and re-evaluates every minute. Dismissed reminders
// are persisted in localStorage so they don't pop again on every refresh.

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { LinkRow } from "@/lib/types";

const ACK_STORAGE_KEY = "km.reminder.acked";

function loadAcked(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(ACK_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveAcked(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore quota errors */
  }
}

export interface DueReminder {
  link: LinkRow;
  /** Human-readable label, falls back through title → domain → url. */
  label: string;
  /** How long ago the reminder fired, e.g. "5 min ago". */
  ago: string;
}

function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Returns the list of currently-due reminders the user has not yet dismissed,
 * plus helpers to dismiss them (single or all). Internally re-evaluates every
 * minute and fires a toast + (if permission was granted) a desktop notification
 * the first time a reminder becomes due in the session.
 */
export function useDueReminders(links: LinkRow[]) {
  const [version, setVersion] = useState(0);
  const ackedRef = useRef<Set<string>>(loadAcked());
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const id = window.setInterval(() => setVersion((v) => v + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Re-read the acked set across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ACK_STORAGE_KEY) return;
      ackedRef.current = loadAcked();
      setVersion((v) => v + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const due = useMemo<DueReminder[]>(() => {
    const now = Date.now();
    const list: DueReminder[] = [];
    for (const l of links) {
      if (!l.reminder_at || l.deleted_at) continue;
      const at = new Date(l.reminder_at).getTime();
      if (Number.isNaN(at) || at > now) continue;
      if (ackedRef.current.has(l.id)) continue;
      list.push({
        link: l,
        label: l.title?.trim() || l.title_bn?.trim() || l.domain || l.url,
        ago: formatAgo(now - at),
      });
    }
    list.sort((a, b) => {
      const ta = a.link.reminder_at ? new Date(a.link.reminder_at).getTime() : 0;
      const tb = b.link.reminder_at ? new Date(b.link.reminder_at).getTime() : 0;
      return tb - ta;
    });
    return list;
    // `version` is intentionally a dependency: changing it forces a recompute
    // every minute so the `ago` strings stay accurate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, version]);

  // Fire toast + desktop notification for newly-due reminders.
  useEffect(() => {
    for (const item of due) {
      if (notifiedRef.current.has(item.link.id)) continue;
      notifiedRef.current.add(item.link.id);
      toast(`Reminder: ${item.label}`, {
        description: "You asked to be reminded about this link.",
        duration: 10_000,
      });
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const n = new Notification("Knowledgemaster reminder", {
            body: item.label,
            tag: item.link.id,
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {
          /* some browsers throw when called from inactive tabs */
        }
      }
    }
  }, [due]);

  const dismiss = useCallback((id: string) => {
    ackedRef.current.add(id);
    saveAcked(ackedRef.current);
    setVersion((v) => v + 1);
  }, []);

  const dismissAll = useCallback(() => {
    for (const item of due) ackedRef.current.add(item.link.id);
    saveAcked(ackedRef.current);
    setVersion((v) => v + 1);
  }, [due]);

  return { due, dismiss, dismissAll };
}

/**
 * Permission state for desktop notifications. Returns the current value and
 * a `request` function that prompts the user (no-op if already granted/denied).
 */
export function useNotificationPermission(): {
  permission: "granted" | "denied" | "default" | "unsupported";
  request: () => Promise<void>;
} {
  const [permission, setPermission] = useState<"granted" | "denied" | "default" | "unsupported">(
    "default",
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const request = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      /* user gesture required / unsupported — ignore */
    }
  }, []);

  return { permission, request };
}
