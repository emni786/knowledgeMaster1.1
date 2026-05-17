import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Bot,
  Loader2,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Activity,
  Chrome,
  Download,
  Plus,
  KeyRound,
  Shield,
  Save,
  Users,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  addTelegramBot,
  deleteTelegramBot,
  listTelegramBots,
  testTelegramWebhook,
} from "@/lib/telegram.functions";
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/api-tokens.functions";
import {
  getAdminSettings,
  getAdminStatus,
  listAllUsers,
  toggleUserAdmin,
  updateAdminSettings,
} from "@/lib/admin-settings.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Knowledgemaster" },
      {
        name: "description",
        content: "Manage your Knowledgemaster account, integrations, and preferences.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/50 bg-background/80 px-4 backdrop-blur">
        <Link to="/library">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-sm font-semibold tracking-tight">Settings</h1>
      </header>
      <main className="mx-auto max-w-3xl space-y-10 px-6 py-10">
        <section>
          <h2 className="font-display text-3xl font-semibold">Settings</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your Knowledgemaster account, integrations, and preferences.
          </p>
        </section>
        <AdminSettings />
        <UserManagement />
        <BrowserExtension />
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
        toast.success(
          `Webhook OK · ${res.pendingUpdates} pending update${res.pendingUpdates === 1 ? "" : "s"}.`,
        );
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
            Paste any link to your own Telegram bot and Knowledgemaster will analyze it (title,
            summary) and save it to your library. Create a bot with{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
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
        <Label
          htmlFor="bot_token"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
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
          Stored encrypted-at-rest in your private library. Only used to receive link messages and
          reply to you.
        </p>
      </form>

      <div className="mt-8 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Connected bots
        </h4>
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
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bot className="h-4 w-4 text-primary" />
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer" className="hover:underline">
                          {handle}
                        </a>
                      ) : (
                        <span>{handle}</span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${b.active ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}
                      >
                        {b.active ? "active" : "paused"}
                      </span>
                    </div>
                    {b.last_error ? (
                      <p className="mt-1 truncate text-xs text-destructive">{b.last_error}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Send the bot any link to save it.
                      </p>
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
                        {copied === b.id ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
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

function BrowserExtension() {
  const qc = useQueryClient();
  const list = useServerFn(listApiTokens);
  const create = useServerFn(createApiToken);
  const revoke = useServerFn(revokeApiToken);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: () => create({ data: { label: "Browser extension" } }),
    onSuccess: (res) => {
      setJustCreated(res.token);
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Token revoked");
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadExtension = () => {
    fetch("/knowledgemaster-extension.zip")
      .then((r) => {
        if (!r.ok) throw new Error(`Download failed: ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "knowledgemaster-extension.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => toast.error(err.message));
  };

  const tokens = data?.tokens ?? [];

  return (
    <section className="rounded-xl border border-border/60 bg-card/40 p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Chrome className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg font-semibold">Browser extension</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Save the page you're on to Knowledgemaster with one click. Install the Chrome extension,
            then paste an API token below to connect it to your account.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button onClick={downloadExtension} variant="outline" className="justify-start gap-2">
          <Download className="h-4 w-4" /> Download extension (.zip)
        </Button>
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="justify-start gap-2"
        >
          {createMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Generate API token
        </Button>
      </div>

      {justCreated && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Your new token — copy it now
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This is shown once. Paste it into the extension popup.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              readOnly
              value={justCreated}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(justCreated);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" onClick={() => setJustCreated(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      <details className="mt-6 rounded-lg border border-border/60 bg-background/60 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Install instructions</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>Download and unzip the extension.</li>
          <li>
            Open <code className="rounded bg-muted px-1">chrome://extensions</code> in Chrome (or
            any Chromium browser).
          </li>
          <li>
            Enable <strong>Developer mode</strong> (top-right toggle).
          </li>
          <li>
            Click <strong>Load unpacked</strong> and select the unzipped folder.
          </li>
          <li>Click the extension icon, paste your API token, then save any page.</li>
        </ol>
      </details>

      <div className="mt-8 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          API tokens
        </h4>
        {isLoading ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : tokens.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            No tokens yet. Generate one to connect the extension.
          </div>
        ) : (
          <ul className="space-y-2">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span>{t.label}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                      {t.token_prefix}…
                    </code>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {new Date(t.created_at).toLocaleDateString()}
                    {t.last_used_at
                      ? ` · Last used ${new Date(t.last_used_at).toLocaleDateString()}`
                      : " · Never used"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={revokeMut.isPending}
                  onClick={() => {
                    if (confirm("Revoke this token? The extension using it will stop working."))
                      revokeMut.mutate(t.id);
                  }}
                  title="Revoke"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AdminSettings() {
  const status = useServerFn(getAdminStatus);
  const get = useServerFn(getAdminSettings);
  const update = useServerFn(updateAdminSettings);
  const qc = useQueryClient();

  const statusQ = useQuery({ queryKey: ["admin-status"], queryFn: () => status() });
  const settingsQ = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => get(),
    enabled: statusQ.data?.isAdmin === true,
  });

  const MASK = "********";
  const [apiKey, setApiKey] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [publicUrl, setPublicUrl] = useState<string>("");
  const [showKey, setShowKey] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Seed the form once the settings query lands.
  if (settingsQ.data && !seeded) {
    setApiKey(settingsQ.data.has_google_ai_api_key ? MASK : "");
    setBaseUrl(settingsQ.data.ai_base_url ?? "");
    setModel(settingsQ.data.ai_model ?? "");
    setPublicUrl(settingsQ.data.public_app_url ?? "");
    setSeeded(true);
  }

  const saveMut = useMutation({
    mutationFn: () =>
      update({
        data: {
          google_ai_api_key: apiKey,
          ai_base_url: baseUrl,
          ai_model: model,
          public_app_url: publicUrl,
        },
      }),
    onSuccess: () => {
      toast.success("Admin settings saved");
      setSeeded(false);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Hide entirely for non-admin users.
  if (!statusQ.data?.isAdmin) return null;

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Shield className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold">Admin settings</h3>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Admin only
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            These shared settings apply to everyone using this deployment. Public users (friends,
            family) will transparently use whatever you save here, without ever seeing this section.
            Anything left blank falls back to the corresponding environment variable on the server.
          </p>
        </div>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
      >
        <div className="space-y-2">
          <Label
            htmlFor="ai_api_key"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Google AI API key
          </Label>
          <div className="flex gap-2">
            <Input
              id="ai_api_key"
              className="h-9 font-mono text-sm"
              type={showKey ? "text" : "password"}
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? "Hide" : "Show"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Get one free at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              aistudio.google.com/apikey
            </a>
            . Leave as <code className="font-mono">********</code> to keep the current key, or clear
            it to remove.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="ai_model"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              AI model
            </Label>
            <Input
              id="ai_model"
              className="h-9 font-mono text-sm"
              placeholder="gemini-2.5-flash"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="ai_base_url"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              AI base URL (optional)
            </Label>
            <Input
              id="ai_base_url"
              className="h-9 font-mono text-sm"
              placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="public_app_url"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Public app URL
          </Label>
          <Input
            id="public_app_url"
            className="h-9 font-mono text-sm"
            placeholder="https://your-app.example.com"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Used to register Telegram bot webhooks. Required when running locally without a tunnel.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-4">
          <p className="text-xs text-muted-foreground">
            {settingsQ.data?.updated_at
              ? `Last updated ${new Date(settingsQ.data.updated_at).toLocaleString()}`
              : "Not saved yet — defaults come from env vars."}
          </p>
          <Button type="submit" size="sm" disabled={saveMut.isPending}>
            {saveMut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" /> Save
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

function UserManagement() {
  const status = useServerFn(getAdminStatus);
  const list = useServerFn(listAllUsers);
  const toggle = useServerFn(toggleUserAdmin);
  const qc = useQueryClient();

  const statusQ = useQuery({ queryKey: ["admin-status"], queryFn: () => status() });
  const usersQ = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
    enabled: statusQ.data?.isAdmin === true,
  });

  const toggleMut = useMutation({
    mutationFn: (vars: { user_id: string; is_admin: boolean }) => toggle({ data: vars }),
    onSuccess: (res) => {
      toast.success(res.is_admin ? "Admin granted" : "Admin revoked");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Hide entirely for non-admin users.
  if (!statusQ.data?.isAdmin) return null;

  const users = usersQ.data?.users ?? [];
  const total = usersQ.data?.total ?? 0;

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold">User management</h3>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Admin only
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            All users sign up on the same PUBLIC Supabase project. Grant another user admin access
            to share runtime settings (AI key, public app URL, user management). The deployment
            owner (ADMIN_EMAIL) is always admin and cannot be revoked.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total users</p>
          <p className="mt-0.5 font-display text-2xl font-semibold">{total}</p>
        </div>
        {usersQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border/60 bg-background/60">
        {usersQ.isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No users yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
                <TableHead className="w-32 text-right">Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const pending = toggleMut.isPending && toggleMut.variables?.user_id === u.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{u.email ?? "—"}</span>
                        {u.is_personal_admin && (
                          <span
                            title="Deployment owner (ADMIN_EMAIL)"
                            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400"
                          >
                            <Crown className="h-3 w-3" />
                            Owner
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {pending && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                        <Switch
                          checked={u.is_admin}
                          disabled={u.is_personal_admin || toggleMut.isPending}
                          onCheckedChange={(checked) =>
                            toggleMut.mutate({ user_id: u.id, is_admin: checked })
                          }
                          aria-label={`Toggle admin for ${u.email ?? u.id}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Granted admins can see this section, edit the shared AI key, and grant or revoke admin for
        other users. They do NOT route data to the personal Supabase project — only the ADMIN_EMAIL
        user does.
      </p>
    </section>
  );
}
