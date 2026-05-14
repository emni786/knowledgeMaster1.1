import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Bot, Loader2, Trash2, ExternalLink, Copy, Check, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  addTelegramBot,
  deleteTelegramBot,
  listTelegramBots,
  testTelegramWebhook,
} from "@/lib/telegram.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Knowledgemaster" },
      { name: "description", content: "Manage your Knowledgemaster account, integrations, and preferences." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/50 bg-background/80 px-4 backdrop-blur">
        <Link to="/library">
          <Button variant="ghost" size="icon" className="h-9 w-9"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-sm font-semibold tracking-tight">Settings</h1>
      </header>
      <main className="mx-auto max-w-3xl space-y-10 px-6 py-10">
        <section>
          <h2 className="font-display text-3xl font-semibold">Settings</h2>
          <p className="mt-2 text-sm text-muted-foreground">Manage your Knowledgemaster account, integrations, and preferences.</p>
        </section>
        <TelegramBots />
      </main>
    </div>
  );
}

function TelegramBots() {
  const qc = useQueryClient();
  const list = useServerFn(listTelegramBots);
  const add = useServerFn(addTelegramBot);
  const remove = useServerFn(deleteTelegramBot);
  const test = useServerFn(testTelegramWebhook);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["telegram-bots"],
    queryFn: () => list(),
  });

  const addMut = useMutation({
    mutationFn: (bot_token: string) => add({ data: { bot_token } }),
    onSuccess: (res) => {
      toast.success(`Connected @${res.username ?? "bot"} — send it a link to save.`);
      setToken("");
      qc.invalidateQueries({ queryKey: ["telegram-bots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Bot disconnected");
      qc.invalidateQueries({ queryKey: ["telegram-bots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (res) => {
      if (res.repaired) {
        toast.success("Webhook URL was wrong — re-registered with Telegram.");
      } else if (res.lastErrorMessage) {
        toast.warning(`Webhook OK, but Telegram reports: ${res.lastErrorMessage}`);
      } else {
        toast.success(`Webhook OK · ${res.pendingUpdates} pending update${res.pendingUpdates === 1 ? "" : "s"}.`);
      }
      qc.invalidateQueries({ queryKey: ["telegram-bots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bots = data?.bots ?? [];

  return (
    <section className="rounded-xl border border-border/60 bg-card/40 p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg font-semibold">Telegram bot</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste any link to your own Telegram bot and Knowledgemaster will analyze it (title, summary) and save it
            to your library. Create a bot with{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              @BotFather <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and paste the token below.
          </p>
        </div>
      </div>

      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!token.trim()) return;
          addMut.mutate(token.trim());
        }}
      >
        <Label htmlFor="bot_token" className="text-xs uppercase tracking-wide text-muted-foreground">
          Bot token
        </Label>
        <div className="flex gap-2">
          <Input
            id="bot_token"
            placeholder="123456789:ABCdefGhIJKlmNoPQRstuVWxyz0123456789"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={addMut.isPending || !token.trim()}>
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Stored encrypted-at-rest in your private library. Only used to receive link messages and reply to you.
        </p>
      </form>

      <div className="mt-8 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connected bots</h4>
        {isLoading ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : bots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            No bot connected yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {bots.map((b) => {
              const handle = b.bot_username ? `@${b.bot_username}` : "Telegram bot";
              const link = b.bot_username ? `https://t.me/${b.bot_username}` : null;
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bot className="h-4 w-4 text-primary" />
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer" className="hover:underline">{handle}</a>
                      ) : (
                        <span>{handle}</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${b.active ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                        {b.active ? "active" : "paused"}
                      </span>
                    </div>
                    {b.last_error ? (
                      <p className="mt-1 truncate text-xs text-destructive">{b.last_error}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Send the bot any link to save it.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {link && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          navigator.clipboard.writeText(link);
                          setCopied(b.id);
                          setTimeout(() => setCopied((c) => (c === b.id ? null : c)), 1500);
                        }}
                        title="Copy bot link"
                      >
                        {copied === b.id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={testMut.isPending && testMut.variables === b.id}
                      onClick={() => testMut.mutate(b.id)}
                      title="Test webhook"
                    >
                      {testMut.isPending && testMut.variables === b.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={delMut.isPending}
                      onClick={() => {
                        if (confirm(`Disconnect ${handle}?`)) delMut.mutate(b.id);
                      }}
                      title="Disconnect"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
