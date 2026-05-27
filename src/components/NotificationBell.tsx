import { Bell, BellRing, ExternalLink, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotificationPermission } from "@/lib/notifications";
import type { DueReminder } from "@/lib/notifications";
import { faviconFor } from "@/lib/url";

interface NotificationBellProps {
  /** Currently-due reminders. Caller (typically a route page) owns the
   *  reminder watcher so the same set is shared across every bell instance. */
  due: DueReminder[];
  dismiss: (id: string) => void;
  dismissAll: () => void;
  /** Callback when the user picks a notification (e.g. to open the detail panel). */
  onOpenLink?: (id: string) => void;
  variant?: "header" | "sidebar";
}

/**
 * Header / sidebar notification bell. Badge surfaces the count of due-but-
 * unread reminders; the popover lists them with quick "Open" / "Dismiss"
 * actions and a "Dismiss all" footer. If the user hasn't yet granted desktop
 * notification permission we surface a one-tap opt-in inside the popover.
 *
 * The bell is a pure presentation component — the actual reminder watcher
 * (toasts, browser-notification firing, persistence of dismissed reminders)
 * lives in `useDueReminders` and is mounted once per authenticated page so
 * multiple bell instances don't double-fire.
 */
export function NotificationBell({
  due,
  dismiss,
  dismissAll,
  onOpenLink,
  variant = "header",
}: NotificationBellProps) {
  const { permission, request } = useNotificationPermission();

  const count = due.length;
  const hasDue = count > 0;
  const Icon = hasDue ? BellRing : Bell;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 hover:bg-primary/10 hover:text-primary"
          aria-label={hasDue ? `${count} reminder${count === 1 ? "" : "s"} due` : "Reminders"}
        >
          <Icon className={`h-4 w-4 ${hasDue ? "text-primary" : ""}`} />
          {hasDue && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-destructive text-destructive-foreground font-mono text-[10px] leading-[16px] px-1 text-center shadow-sm"
              aria-hidden="true"
            >
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side={variant === "sidebar" ? "right" : "bottom"}
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Reminders
          </div>
          {hasDue && (
            <button
              type="button"
              onClick={() => dismissAll()}
              className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
            >
              Dismiss all
            </button>
          )}
        </div>
        {!hasDue && (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No due reminders.
          </div>
        )}
        {hasDue && (
          <ScrollArea className="max-h-[60vh]">
            <ul className="divide-y divide-border/40">
              {due.map((item) => (
                <li
                  key={item.link.id}
                  className="flex items-start gap-2 px-3 py-2.5 group hover:bg-accent/40"
                >
                  <img
                    src={faviconFor(item.link.url)}
                    alt=""
                    className="h-4 w-4 mt-0.5 rounded shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium leading-snug line-clamp-2">
                      {item.label}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                      <span>{item.link.domain || ""}</span>
                      {item.link.domain && <span>·</span>}
                      <span>{item.ago}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenLink?.(item.link.id);
                          dismiss(item.link.id);
                        }}
                        className="inline-flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => dismiss(item.link.id)}
                        className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
        {permission === "default" && (
          <div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={() => void request()}
              className="font-mono text-[10px] underline-offset-2 hover:underline text-foreground"
            >
              Enable desktop notifications
            </button>{" "}
            so you get nudged even when this tab isn&apos;t focused.
          </div>
        )}
        {permission === "denied" && (
          <div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            Desktop notifications are blocked. Enable them in your browser site settings to be
            nudged when this tab is in the background.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
