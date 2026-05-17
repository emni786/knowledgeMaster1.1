import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Compass,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Newspaper,
  AppWindow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { getTrending, type TrendingItem } from "@/lib/insights.functions";
import { addLinks } from "@/lib/api/links";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({
    meta: [
      { title: "Discover — Knowledgemaster" },
      {
        name: "description",
        content: "Trending apps and the latest AI news, curated by AI in real time.",
      },
    ],
  }),
  component: Page,
});

type Focus = "all" | "apps" | "ai-news";

function Page() {
  const trendingFn = useServerFn(getTrending);
  const [focus, setFocus] = useState<Focus>("all");
  const [items, setItems] = useState<TrendingItem[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (f: Focus) => trendingFn({ data: { focus: f } }),
    onSuccess: (res) => {
      setItems(res.items);
      setGeneratedAt(res.generatedAt);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    mut.mutate(focus); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const onFocus = (f: Focus) => {
    setFocus(f);
    mut.mutate(f);
  };

  const save = async (it: TrendingItem) => {
    try {
      await addLinks([it.url]);
      toast.success(`Saved “${it.title.slice(0, 40)}…”`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell
      title="Discover"
      description="AI-curated trending apps and breaking AI news. Tap refresh for a new pull."
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => mut.mutate(focus)}
          disabled={mut.isPending}
        >
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2 hidden sm:inline">Refresh</span>
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill active={focus === "all"} onClick={() => onFocus("all")} icon={Sparkles}>
          All trending
        </Pill>
        <Pill active={focus === "apps"} onClick={() => onFocus("apps")} icon={AppWindow}>
          Apps
        </Pill>
        <Pill active={focus === "ai-news"} onClick={() => onFocus("ai-news")} icon={Newspaper}>
          AI news
        </Pill>
        {generatedAt && (
          <span className="ml-auto text-[11px] font-mono text-muted-foreground">
            updated {new Date(generatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {mut.isPending && !items ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-border/60 bg-card/40"
            />
          ))}
        </div>
      ) : items && items.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((it, i) => (
            <article
              key={i}
              className="group rounded-2xl border border-border/60 bg-card/40 p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <CategoryBadge cat={it.category} />
                    {it.source && <span>· {it.source}</span>}
                  </div>
                  <h3 className="mt-2 font-display text-lg font-semibold leading-snug">
                    {it.title}
                  </h3>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{it.summary}</p>
              <div className="mt-4 flex items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={it.url} target="_blank" rel="noreferrer">
                    Open <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => save(it)}>
                  Save to library
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid h-[300px] place-items-center rounded-2xl border border-dashed border-border/60 text-center">
          <div>
            <Compass className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No items yet. Try refreshing.</p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Pill({
  children,
  active,
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  icon: typeof Compass;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

function CategoryBadge({ cat }: { cat: TrendingItem["category"] }) {
  const map: Record<string, string> = {
    "ai-news": "bg-primary/15 text-primary",
    app: "bg-emerald-500/15 text-emerald-500",
    tool: "bg-amber-500/15 text-amber-500",
    research: "bg-violet-500/15 text-violet-500",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 ${map[cat] ?? "bg-muted text-muted-foreground"}`}>
      {cat}
    </span>
  );
}
