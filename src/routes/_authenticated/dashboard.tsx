import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchLinks } from "@/lib/api/links";
import { AppShell } from "@/components/AppShell";
import { AtomGraph } from "@/components/AtomGraph";
import { Activity, Link2, Pin, AlertTriangle, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Xenonowledge" },
      { name: "description", content: "3D atoms view of your knowledge library, real-time stats, and ingest velocity." },
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
    links.filter((l) => !l.deleted_at).forEach((l) => {
      const d = startOfDay(new Date(l.created_at)).toISOString();
      const slot = days.find((s) => s.date === d);
      if (slot) slot.count++;
    });
    return days;
  }, [links]);

  const atoms = useMemo(() => {
    const active = links.filter((l) => !l.deleted_at);
    const byDomain = new Map<string, { value: number; tags: Set<string>; titles: string[] }>();
    active.forEach((l) => {
      const k = l.domain ?? "other";
      const cur = byDomain.get(k) ?? { value: 0, tags: new Set<string>(), titles: [] };
      cur.value++;
      (l.tags ?? []).forEach((t) => cur.tags.add(t));
      if (l.title) cur.titles.push(l.title);
      byDomain.set(k, cur);
    });
    return Array.from(byDomain.entries())
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 6)
      .map(([label, v]) => ({
        label,
        value: v.value,
        electrons: (v.tags.size ? Array.from(v.tags) : v.titles).slice(0, 5),
      }));
  }, [links]);

  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-links")
      .on("postgres_changes", { event: "*", schema: "public", table: "links" }, () => {
        qc.invalidateQueries({ queryKey: ["links"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return (
    <AppShell
      title="Dashboard"
      description="A live, atomic view of your knowledge graph — every domain is a nucleus, every tag an electron in orbit."
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Link2} label="Total links" value={stats.total} loading={isLoading} />
        <Stat icon={TrendingUp} label="Last 7 days" value={stats.recent} loading={isLoading} tone="primary" />
        <Stat icon={Pin} label="Pinned" value={stats.pinned} loading={isLoading} />
        <Stat icon={AlertTriangle} label="Failed" value={stats.failed} loading={isLoading} tone={stats.failed ? "destructive" : "muted"} />
      </div>

      <section className="space-y-3">
        <Header icon={Activity} title="Knowledge atoms" subtitle="Top domains in your library, electrons are tags or titles." />
        <AtomGraph atoms={atoms} />
      </section>

      <section className="space-y-3">
        <Header icon={TrendingUp} title="Ingest velocity" subtitle="Links saved per day over the last 14 days." />
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
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#velocity)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </AppShell>
  );
}

function Stat({
  icon: Icon, label, value, loading, tone = "default",
}: {
  icon: typeof Activity; label: string; value: number; loading?: boolean;
  tone?: "default" | "primary" | "muted" | "destructive";
}) {
  const toneCls =
    tone === "primary" ? "text-primary"
    : tone === "destructive" ? "text-destructive"
    : tone === "muted" ? "text-muted-foreground"
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

function Header({ icon: Icon, title, subtitle }: { icon: typeof Activity; title: string; subtitle: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {title}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

