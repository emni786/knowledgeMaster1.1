import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import type { LinkRow } from "@/lib/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ExternalLink, Hash, Link2, Loader2 } from "lucide-react";
import { faviconFor, getDomain } from "@/lib/url";

// react-force-graph-3d uses WebGL — lazy-load to keep it out of SSR
const ForceGraph3D = lazy(() =>
  import("react-force-graph-3d").then((m) => ({ default: m.default as any }))
);

type GNode = {
  id: string;
  label: string;
  count: number;
  val: number;
  color: string;
};
type GLink = { source: string; target: string; value: number };

const PALETTE = [
  "#7c5cff", "#22d3ee", "#f472b6", "#fbbf24", "#34d399",
  "#fb7185", "#60a5fa", "#a78bfa", "#f59e0b", "#10b981",
];

export function TopicGraph3D({ links }: { links: LinkRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [mounted, setMounted] = useState(false);
  const [openTag, setOpenTag] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: Math.max(420, Math.min(640, el.clientWidth * 0.55)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, edges, byTag } = useMemo(() => {
    const active = links.filter((l) => !l.deleted_at);
    const tagCount = new Map<string, number>();
    const byTag = new Map<string, LinkRow[]>();
    const cooc = new Map<string, number>();

    active.forEach((l) => {
      const tags = (l.tags ?? []).filter(Boolean);
      tags.forEach((t) => {
        tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
        const arr = byTag.get(t) ?? [];
        arr.push(l);
        byTag.set(t, arr);
      });
      const u = Array.from(new Set(tags));
      for (let i = 0; i < u.length; i++) {
        for (let j = i + 1; j < u.length; j++) {
          const [a, b] = [u[i], u[j]].sort();
          const k = `${a}\u0000${b}`;
          cooc.set(k, (cooc.get(k) ?? 0) + 1);
        }
      }
    });

    const top = Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60);
    const allowed = new Set(top.map(([t]) => t));

    const nodes: GNode[] = top.map(([t, c], i) => ({
      id: t,
      label: t,
      count: c,
      val: Math.max(1, Math.sqrt(c) * 4),
      color: PALETTE[i % PALETTE.length],
    }));

    const edges: GLink[] = [];
    cooc.forEach((v, k) => {
      const [a, b] = k.split("\u0000");
      if (allowed.has(a) && allowed.has(b)) edges.push({ source: a, target: b, value: v });
    });

    return { nodes, edges, byTag };
  }, [links]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // Soften forces for nicer layout
    try {
      fg.d3Force?.("charge")?.strength?.(-90);
      fg.d3Force?.("link")?.distance?.((l: any) => 30 + 80 / Math.max(1, l.value));
    } catch {}
  }, [mounted, nodes.length]);

  const openLinks = openTag ? byTag.get(openTag) ?? [] : [];

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-10 text-center">
        <Hash className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          No topics yet. Save links and let AI tag them — your knowledge graph will appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="rounded-2xl border border-border/60 bg-gradient-to-b from-background to-card/40 overflow-hidden relative"
        style={{ height: size.h }}
      >
        {mounted ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            }
          >
            <ForceGraph3D
              ref={fgRef}
              width={size.w}
              height={size.h}
              graphData={{ nodes, links: edges }}
              backgroundColor="rgba(0,0,0,0)"
              nodeLabel={(n: any) => `${n.label} · ${n.count} link${n.count > 1 ? "s" : ""}`}
              nodeColor={(n: any) => n.color}
              nodeOpacity={0.95}
              nodeRelSize={4}
              linkColor={() => "rgba(148,163,184,0.35)"}
              linkWidth={(l: any) => Math.min(3, 0.4 + l.value * 0.6)}
              linkOpacity={0.55}
              linkDirectionalParticles={1}
              linkDirectionalParticleWidth={(l: any) => Math.min(2, l.value * 0.4)}
              linkDirectionalParticleSpeed={() => 0.004}
              enableNodeDrag
              showNavInfo={false}
              onNodeClick={(n: any) => {
                setOpenTag(n.id);
                const fg = fgRef.current;
                if (fg && n.x != null) {
                  const dist = 120;
                  const ratio = 1 + dist / Math.hypot(n.x, n.y, n.z);
                  fg.cameraPosition({ x: n.x * ratio, y: n.y * ratio, z: n.z * ratio }, n, 1000);
                }
              }}
            />
          </Suspense>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] uppercase tracking-widest font-mono text-muted-foreground/80">
          Click a topic · Drag to rotate · Scroll to zoom
        </div>
      </div>

      <Sheet open={!!openTag} onOpenChange={(o) => !o && setOpenTag(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-primary" />
              <span className="font-mono">{openTag}</span>
            </SheetTitle>
            <SheetDescription>
              {openLinks.length} link{openLinks.length === 1 ? "" : "s"} tagged with this topic.
            </SheetDescription>
          </SheetHeader>
          <ul className="mt-4 space-y-2">
            {openLinks.map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-3 hover:bg-primary/5 hover:border-primary/40 transition-colors"
                >
                  <img
                    src={faviconFor(l.url)}
                    alt=""
                    className="h-5 w-5 rounded mt-0.5 shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {l.title ?? l.url}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{getDomain(l.url)}</span>
                      <span>·</span>
                      <Link2 className="h-3 w-3" />
                    </div>
                    {l.tags && l.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {l.tags.slice(0, 6).map((t) => (
                          <button
                            key={t}
                            onClick={(e) => {
                              e.preventDefault();
                              setOpenTag(t);
                            }}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                              t === openTag
                                ? "bg-primary/20 text-primary"
                                : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            }`}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                </a>
              </li>
            ))}
            {openLinks.length === 0 && (
              <li className="text-sm text-muted-foreground py-6 text-center">
                No links found for this topic.
              </li>
            )}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
