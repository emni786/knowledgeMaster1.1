import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchLinks } from "@/lib/api/links";
import { AppShell } from "@/components/AppShell";
import { BarChart3, PieChart as PieIcon, Tag, Globe } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Knowledgemaster" },
      {
        name: "description",
        content:
          "Insights into your reading habits: top domains, content mix, tag heatmap and ingest trend.",
      },
    ],
  }),
  component: Page,
});

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 220 70% 60%))",
  "hsl(var(--chart-3, 160 60% 50%))",
  "hsl(var(--chart-4, 30 90% 60%))",
  "hsl(var(--chart-5, 280 70% 65%))",
  "hsl(var(--chart-6, 0 70% 60%))",
  "hsl(var(--muted-foreground))",
];

function Page() {
  const { data: links = [], isLoading } = useQuery({ queryKey: ["links"], queryFn: fetchLinks });
  const active = useMemo(() => links.filter((l) => !l.deleted_at), [links]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    active.forEach((l) => m.set(l.content_type, (m.get(l.content_type) ?? 0) + 1));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [active]);

  const topDomains = useMemo(() => {
    const m = new Map<string, number>();
    active.forEach((l) => {
      const k = l.domain ?? "other";
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [active]);

  const topTags = useMemo(() => {
    const m = new Map<string, number>();
    active.forEach((l) => (l.tags ?? []).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [active]);

  const trend = useMemo(() => {
    const days: Array<{ date: string; label: string } & Record<string, number | string>> = [];
    for (let i = 29; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      days.push({
        date: d.toISOString(),
        label: format(d, "MMM d"),
        saved: 0,
        telegram: 0,
        manual: 0,
      });
    }
    active.forEach((l) => {
      const d = startOfDay(new Date(l.created_at)).toISOString();
      const slot = days.find((s) => s.date === d) as Record<string, number | string> | undefined;
      if (!slot) return;
      slot.saved = (slot.saved as number) + 1;
      if (l.source === "telegram") slot.telegram = (slot.telegram as number) + 1;
      else slot.manual = (slot.manual as number) + 1;
    });
    return days;
  }, [active]);

  const sources = useMemo(() => {
    const m: Record<string, number> = { manual: 0, telegram: 0, import: 0 };
    active.forEach((l) => {
      m[l.source] = (m[l.source] ?? 0) + 1;
    });
    return Object.entries(m)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [active]);

  return (
    <AppShell
      title="Analytics"
      description="What you're collecting, where it comes from, and how your library grows over time."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card icon={BarChart3} title="Top domains" subtitle="Where you save from most.">
          <div className="h-64">
            {topDomains.length ? (
              <ResponsiveContainer>
                <BarChart data={topDomains} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </div>
        </Card>

        <Card icon={PieIcon} title="Content mix" subtitle="Articles vs videos vs repos…">
          <div className="h-64">
            {byType.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={byType}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {byType.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </div>
        </Card>
      </div>

      <Card icon={BarChart3} title="Ingest trend (30 days)" subtitle="Manual vs Telegram captures.">
        <div className="h-72">
          {trend.some((d) => (d.saved as number) > 0) ? (
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="manual"
                  stroke={COLORS[0]}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="telegram"
                  stroke={COLORS[2]}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card icon={Tag} title="Top tags" subtitle="Your AI-extracted topics.">
          {topTags.length ? (
            <div className="flex flex-wrap gap-2">
              {topTags.map(([tag, count]) => {
                const max = topTags[0][1];
                const scale = 0.85 + (count / max) * 0.6;
                return (
                  <span
                    key={tag}
                    className="rounded-full border border-border/60 bg-primary/5 px-3 py-1 text-xs font-medium"
                    style={{ fontSize: `${scale * 12}px` }}
                  >
                    {tag} <span className="font-mono text-muted-foreground">·{count}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <Empty msg="No tags yet — links forwarded via Telegram get auto-tagged." />
          )}
        </Card>

        <Card icon={Globe} title="Sources" subtitle="How links land in your library.">
          <div className="h-56">
            {sources.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={sources} dataKey="value" nameKey="name" outerRadius={85}>
                    {sources.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </div>
        </Card>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
    </AppShell>
  );
}

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof BarChart3;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {title}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Empty({ msg = "Not enough data yet." }: { msg?: string }) {
  return <div className="grid h-full place-items-center text-xs text-muted-foreground">{msg}</div>;
}
