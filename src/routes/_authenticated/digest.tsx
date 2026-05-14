import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Newspaper, Loader2, RefreshCw, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { getDigest, type Digest } from "@/lib/insights.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/digest")({
  head: () => ({
    meta: [
      { title: "Digest — Knowledgemaster" },
      { name: "description", content: "AI-written digest of everything you saved this week or month." },
    ],
  }),
  component: Page,
});

type Win = "week" | "month";
type DigestLink = { id: string; title: string | null; url: string; domain: string | null };

function Page() {
  const fn = useServerFn(getDigest);
  const [win, setWin] = useState<Win>("week");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [count, setCount] = useState(0);
  const [links, setLinks] = useState<DigestLink[]>([]);

  const mut = useMutation({
    mutationFn: (w: Win) => fn({ data: { window: w } }),
    onSuccess: (res) => {
      setDigest(res.digest);
      setCount(res.count);
      setLinks(res.links ?? []);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => { mut.mutate(win); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const onWin = (w: Win) => { setWin(w); mut.mutate(w); };

  const linkById = (id: string) => links.find((l) => l.id === id);

  return (
    <AppShell
      title="Digest"
      description="A clean, themed brief of everything you saved — written by AI, grounded in your library."
      actions={
        <Button size="sm" variant="outline" onClick={() => mut.mutate(win)} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2 hidden sm:inline">Regenerate</span>
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <Pill active={win === "week"} onClick={() => onWin("week")}>Past 7 days</Pill>
        <Pill active={win === "month"} onClick={() => onWin("month")}>Past 30 days</Pill>
        <span className="ml-auto text-[11px] font-mono text-muted-foreground">
          {count} link{count === 1 ? "" : "s"} considered
        </span>
      </div>

      {mut.isPending && !digest ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
          ))}
        </div>
      ) : digest ? (
        <>
          <section className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-background to-background p-6">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-primary">
              <Sparkles className="h-3.5 w-3.5" /> This {win}
            </div>
            <h3 className="mt-2 font-display text-2xl md:text-3xl font-semibold leading-tight">{digest.headline}</h3>
          </section>

          <section className="space-y-3">
            <SectionTitle>Themes</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {digest.themes.map((t, i) => (
                <article key={i} className="rounded-2xl border border-border/60 bg-card/40 p-5">
                  <h4 className="font-display text-lg font-semibold">{t.title}</h4>
                  <p className="mt-2 text-sm text-muted-foreground">{t.summary}</p>
                  {t.linkIds.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {t.linkIds.slice(0, 5).map((id) => {
                        const l = linkById(id);
                        if (!l) return null;
                        return (
                          <li key={id}>
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noreferrer"
                              className="group inline-flex items-start gap-1.5 text-xs hover:text-primary"
                            >
                              <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-60 group-hover:opacity-100" />
                              <span className="truncate">
                                <span className="font-medium">{l.title ?? l.url}</span>
                                {l.domain && <span className="text-muted-foreground"> · {l.domain}</span>}
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>Key takeaways</SectionTitle>
            <ul className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-2">
              {digest.takeaways.map((t, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <div className="grid h-[300px] place-items-center rounded-2xl border border-dashed border-border/60 text-center">
          <div>
            <Newspaper className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No digest yet.</p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Pill({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{children}</h3>;
}
