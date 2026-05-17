import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchLinks } from "@/lib/api/links";
import { AppShell } from "@/components/AppShell";
import { TopicGraph3D } from "@/components/TopicGraph3D";
import { PageTabs } from "@/components/PageTabs";
import { analyzeTopics } from "@/lib/insights.functions";
import {
  listRssFeeds,
  addRssFeed,
  deleteRssFeed,
  refreshRssFeed,
  toggleRssFeed,
} from "@/lib/rss.functions";
import {
  Activity,
  Link2,
  Pin,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  Loader2,
  Rss,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  Boxes,
  Hash,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Knowledgemaster" },
      {
        name: "description",
        content: "3D atoms view of your knowledge library, real-time stats, and ingest velocity.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: links = [], isLoading } = useQuery({
    queryKey: ["links"],
    queryFn: fetchLinks,
  });

  const stats = useMemo(() => {
    const active = links.filter((l) => !l.deleted_at);
    const last7 = subDays(new Date(), 7);
    const recent = active.filter((l) => new Date(l.created_at) > last7);
    return {
      total: active.length,
      pinned: active.filter((l) => l.pinned).length,
      failed: active.filter((l) => l.status === "failed").length,
      recent: recent.length,
    };
  }, [links]);

  const series = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      days.push({ date: d.toISOString(), label: format(d, "MMM d"), count: 0 });
    }
    links
      .filter((l) => !l.deleted_at)
      .forEach((l) => {
        const d = startOfDay(new Date(l.created_at)).toISOString();
        const slot = days.find((s) => s.date === d);
        if (slot) slot.count++;
      });
    return days;
  }, [links]);

  const activeLinks = useMemo(() => links.filter((l) => !l.deleted_at), [links]);
  const [clusters, setClusters] = useState(false);

  const cosmosStats = useMemo(
    () => computeCosmosStats(activeLinks, clusters),
    [activeLinks, clusters],
  );

  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-links")
      .on("postgres_changes", { event: "*", schema: "public", table: "links" }, () => {
        qc.invalidateQueries({ queryKey: ["links"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const [tab, setTab] = useState<"overview" | "trends" | "feeds">("overview");

  return (
    <AppShell
      title="Dashboard"
      description="A live, atomic view of your knowledge graph — every domain is a nucleus, every tag an electron in orbit."
    >
      <PageTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview", icon: Activity },
          { id: "trends", label: "Trends", icon: TrendingUp },
          { id: "feeds", label: "Feeds", icon: Rss },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={Link2} label="Total links" value={stats.total} loading={isLoading} />
            <Stat
              icon={TrendingUp}
              label="Last 7 days"
              value={stats.recent}
              loading={isLoading}
              tone="primary"
            />
            <Stat icon={Pin} label="Pinned" value={stats.pinned} loading={isLoading} />
            <Stat
              icon={AlertTriangle}
              label="Failed"
              value={stats.failed}
              loading={isLoading}
              tone={stats.failed ? "destructive" : "muted"}
            />
          </div>

          <section className="space-y-3">
            <Header
              icon={Activity}
              title="Knowledge graph"
              subtitle="Each node is a topic from your library. Edges connect topics that appear on the same link. Click a node to see its links."
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setClusters((v) => !v)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    clusters
                      ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300"
                      : "border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground"
                  }`}
                  title="Recolor planets by connected component"
                >
                  <Boxes className="h-3.5 w-3.5" />
                  Clusters {clusters ? "on" : "off"}
                </button>
                <AnalyzeTopicsButton />
              </div>
            </Header>
            <TopicGraph3D links={activeLinks} clusters={clusters} onClustersChange={setClusters} />
          </section>
        </div>
      )}

      {tab === "trends" && (
        <div className="space-y-8">
          <section className="space-y-3">
            <Header
              icon={TrendingUp}
              title="Ingest velocity"
              subtitle="Links saved per day over the last 14 days."
            />
            <div className="rounded-2xl border border-border/60 bg-card/40 p-4 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="velocity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#velocity)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="space-y-3">
            <Header
              icon={Sparkles}
              title="Cosmos breakdown"
              subtitle="Top topics, edges, and group composition for your current graph."
            />
            <CosmosStatsPanel stats={cosmosStats} clusters={clusters} />
          </section>
        </div>
      )}

      {tab === "feeds" && <RssFeedsSection />}
    </AppShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  loading,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  loading?: boolean;
  tone?: "default" | "primary" | "muted" | "destructive";
}) {
  const toneCls =
    tone === "primary"
      ? "text-primary"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-widest font-mono text-muted-foreground">
        <span>{label}</span>
        <Icon className={`h-4 w-4 ${toneCls}`} />
      </div>
      <div className={`mt-2 font-display text-3xl font-semibold tabular-nums ${toneCls}`}>
        {loading ? "—" : value}
      </div>
    </div>
  );
}

function Header({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Activity;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {title}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function AnalyzeTopicsButton() {
  const fn = useServerFn(analyzeTopics);
  const qc = useQueryClient();
  const [mode, setMode] = useState<"missing" | "all">("missing");
  const m = useMutation({
    mutationFn: (force: boolean) => fn({ data: { force } }),
    onSuccess: (res) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["links"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setMode("missing");
          m.mutate(false);
        }}
        disabled={m.isPending}
      >
        {m.isPending && mode === "missing" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Analyze new
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setMode("all");
          m.mutate(true);
        }}
        disabled={m.isPending}
      >
        {m.isPending && mode === "all" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Re-analyze all
      </Button>
    </div>
  );
}

function RssFeedsSection() {
  const qc = useQueryClient();
  const list = useServerFn(listRssFeeds);
  const add = useServerFn(addRssFeed);
  const del = useServerFn(deleteRssFeed);
  const refresh = useServerFn(refreshRssFeed);
  const toggle = useServerFn(toggleRssFeed);

  const [url, setUrl] = useState("");

  const feedsQuery = useQuery({
    queryKey: ["rss-feeds"],
    queryFn: () => list(),
  });

  const addMut = useMutation({
    mutationFn: (u: string) => add({ data: { url: u } }),
    onSuccess: (row) => {
      setUrl("");
      qc.invalidateQueries({ queryKey: ["rss-feeds"] });
      if (row?.last_error) toast.warning(`Added with warning: ${row.last_error}`);
      else toast.success("Feed added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMut = useMutation({
    mutationFn: (id: string) => refresh({ data: { id } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["rss-feeds"] });
      qc.invalidateQueries({ queryKey: ["links"] });
      toast.success(`Imported ${res.imported} new, skipped ${res.skipped}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rss-feeds"] });
      toast.success("Feed removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rss-feeds"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const v = url.trim();
    if (!v) return;
    try {
      new URL(v);
    } catch {
      toast.error("Enter a valid URL");
      return;
    }
    addMut.mutate(v);
  };

  const feeds = feedsQuery.data ?? [];

  return (
    <section className="space-y-3">
      <Header
        icon={Rss}
        title="RSS feeds"
        subtitle="Subscribe to feeds and import new entries straight into your library."
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-4">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="font-mono text-sm"
            disabled={addMut.isPending}
          />
          <Button type="submit" disabled={addMut.isPending || !url.trim()}>
            {addMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add feed
          </Button>
        </form>

        {feedsQuery.isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading feeds…</div>
        ) : feeds.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border/60 rounded-xl">
            No feeds yet. Paste an RSS or Atom URL above to get started.
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {feeds.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-3">
                <Rss className="h-4 w-4 text-primary/70 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{f.title || f.domain || f.url}</div>
                  <div className="text-[11px] font-mono text-muted-foreground truncate">
                    {f.url}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{f.items_imported} imported</span>
                    {f.last_fetched_at && (
                      <span>
                        · refreshed{" "}
                        {formatDistanceToNow(new Date(f.last_fetched_at), { addSuffix: true })}
                      </span>
                    )}
                    {f.last_error && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="h-3 w-3" /> {f.last_error}
                      </span>
                    )}
                  </div>
                </div>
                <Switch
                  checked={f.active}
                  onCheckedChange={(v) => toggleMut.mutate({ id: f.id, active: v })}
                  aria-label="Active"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => refreshMut.mutate(f.id)}
                  disabled={refreshMut.isPending && refreshMut.variables === f.id}
                  title="Refresh now"
                >
                  {refreshMut.isPending && refreshMut.variables === f.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Remove this feed?")) delMut.mutate(f.id);
                  }}
                  className="text-destructive hover:text-destructive"
                  title="Delete"
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

// ---------- Cosmos Stats ----------

const PLANET_PALETTE = [
  { name: "Saturn Gold", color: "#fbbf24" },
  { name: "Mars Red", color: "#ef4444" },
  { name: "Pluto Purple", color: "#a78bfa" },
  { name: "Uranus Cyan", color: "#22d3ee" },
  { name: "Neptune Blue", color: "#3b82f6" },
  { name: "Earth Green", color: "#34d399" },
  { name: "Jupiter Orange", color: "#fb923c" },
  { name: "Venus Pink", color: "#f472b6" },
];

type CosmosTopic = { id: string; count: number; group: number; color: string; groupName: string };
type CosmosStats = {
  topics: number;
  edges: number;
  mentions: number;
  density: number;
  topTopics: CosmosTopic[];
  groups: { name: string; color: string; count: number }[];
};

function computeCosmosStats(links: any[], clusters: boolean): CosmosStats {
  const tagCount = new Map<string, number>();
  const cooc = new Map<string, number>();
  (links as any[]).forEach((l) => {
    const tags = ((l.tags ?? []) as string[]).filter(Boolean);
    tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1));
    const u = Array.from(new Set(tags));
    for (let i = 0; i < u.length; i++) {
      for (let j = i + 1; j < u.length; j++) {
        const [a, b] = [u[i], u[j]].sort();
        cooc.set(`${a}\u0000${b}`, (cooc.get(`${a}\u0000${b}`) ?? 0) + 1);
      }
    }
  });

  const top = Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60);
  const allowed = new Set(top.map(([t]) => t));

  const adjacency = new Map<string, Set<string>>();
  let edges = 0;
  cooc.forEach((_, k) => {
    const [a, b] = k.split("\u0000");
    if (!allowed.has(a) || !allowed.has(b)) return;
    edges++;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  });

  const hashGroup = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % PLANET_PALETTE.length;
  };

  let groupOf: (id: string) => number;
  if (clusters) {
    const seen = new Map<string, number>();
    let c = 0;
    top.forEach(([id]) => {
      if (seen.has(id)) return;
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.set(cur, c);
        adjacency.get(cur)?.forEach((n) => {
          if (!seen.has(n)) stack.push(n);
        });
      }
      c++;
    });
    groupOf = (id) => (seen.get(id) ?? 0) % PLANET_PALETTE.length;
  } else {
    groupOf = hashGroup;
  }

  const topics: CosmosTopic[] = top.map(([id, count]) => {
    const g = groupOf(id);
    return {
      id,
      count,
      group: g,
      color: PLANET_PALETTE[g].color,
      groupName: PLANET_PALETTE[g].name,
    };
  });

  const groupCount = new Map<number, number>();
  topics.forEach((t) => groupCount.set(t.group, (groupCount.get(t.group) ?? 0) + 1));
  const groups = Array.from(groupCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([g, count]) => ({ name: PLANET_PALETTE[g].name, color: PLANET_PALETTE[g].color, count }));

  const mentions = topics.reduce((s, t) => s + t.count, 0);
  const maxEdges = (topics.length * (topics.length - 1)) / 2;
  const density = maxEdges ? edges / maxEdges : 0;

  return { topics: topics.length, edges, mentions, density, topTopics: topics.slice(0, 8), groups };
}

function CosmosStatsPanel({ stats, clusters }: { stats: CosmosStats; clusters: boolean }) {
  const maxCount = Math.max(1, ...stats.topTopics.map((t) => t.count));
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Cosmos stats
        </div>
        <span
          className={`text-[10px] font-mono uppercase tracking-widest ${clusters ? "text-cyan-300" : "text-muted-foreground"}`}
        >
          {clusters ? "Clusters mode" : "Tag groups"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat icon={Hash} label="Planets" value={stats.topics} />
        <MiniStat icon={Network} label="Edges" value={stats.edges} />
        <MiniStat icon={Activity} label="Mentions" value={stats.mentions} />
        <MiniStat icon={Boxes} label="Density" value={`${(stats.density * 100).toFixed(1)}%`} />
      </div>

      <div className="mt-5 grid md:grid-cols-2 gap-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Top topics
          </div>
          {stats.topTopics.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">No tagged topics yet.</div>
          ) : (
            <ul className="space-y-1.5">
              {stats.topTopics.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: t.color }}
                  />
                  <span className="font-mono text-sm truncate min-w-0 flex-1">{t.id}</span>
                  <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(t.count / maxCount) * 100}%`, background: t.color }}
                    />
                  </div>
                  <span className="tabular-nums text-xs text-muted-foreground w-8 text-right">
                    {t.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            {clusters ? "Clusters" : "Tag groups"}
          </div>
          {stats.groups.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">—</div>
          ) : (
            <ul className="space-y-1.5">
              {stats.groups.map((g, i) => (
                <li key={`${g.name}-${i}`} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: g.color }}
                  />
                  <span className="text-sm truncate min-w-0 flex-1">
                    {clusters ? `Cluster ${i + 1}` : g.name}
                  </span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {g.count} {g.count === 1 ? "planet" : "planets"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
