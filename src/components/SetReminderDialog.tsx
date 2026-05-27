import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SetReminderDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Title to display in the dialog so the user knows which link they're scheduling. */
  linkLabel: string;
  /** Current reminder timestamp (ISO) if any, used to seed the custom input. */
  currentAt: string | null;
  /** Persist the new reminder. Null clears it. */
  onSave: (atIso: string | null) => void;
}

interface Preset {
  label: string;
  minutes: number;
}

const PRESETS: Preset[] = [
  { label: "20 min", minutes: 20 },
  { label: "1 hour", minutes: 60 },
  { label: "3 hours", minutes: 60 * 3 },
  { label: "Tomorrow", minutes: 60 * 24 },
  { label: "Next week", minutes: 60 * 24 * 7 },
];

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local expects "YYYY-MM-DDTHH:mm" in local time.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * Set / change a "remind me later" timestamp for a link. Replaces the prior
 * cramped dropdown — gives presets, a clean datetime input, and a clear-button
 * all in a consistent dialog that matches the rest of the app.
 */
export function SetReminderDialog({
  open,
  onOpenChange,
  linkLabel,
  currentAt,
  onSave,
}: SetReminderDialogProps) {
  const [customAt, setCustomAt] = useState<string>("");

  useEffect(() => {
    if (open) setCustomAt(toLocalInputValue(currentAt));
  }, [open, currentAt]);

  const pickPreset = (minutes: number) => {
    const at = new Date(Date.now() + minutes * 60_000);
    onSave(at.toISOString());
    onOpenChange(false);
  };

  const saveCustom = () => {
    if (!customAt) return;
    const at = new Date(customAt);
    if (Number.isNaN(at.getTime())) return;
    onSave(at.toISOString());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Set reminder
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            We&apos;ll nudge you about{" "}
            <span className="text-foreground font-medium">{linkLabel}</span> when the time comes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Quick presets
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 font-mono text-xs"
                  onClick={() => pickPreset(p.minutes)}
                >
                  In {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">
              Pick a date &amp; time
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="datetime-local"
                value={customAt}
                onChange={(e) => setCustomAt(e.target.value)}
                className="h-9 text-sm font-mono flex-1 min-w-0"
              />
              <Button
                type="button"
                size="sm"
                className="h-9 font-mono text-xs"
                disabled={!customAt}
                onClick={saveCustom}
              >
                Save
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {currentAt ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 font-mono text-xs text-destructive hover:bg-destructive/10"
              onClick={() => {
                onSave(null);
                onOpenChange(false);
              }}
            >
              <BellOff className="h-3.5 w-3.5 mr-1.5" />
              Clear reminder
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 font-mono text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
