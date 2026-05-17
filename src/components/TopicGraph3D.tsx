import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import type { LinkRow } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  ExternalLink,
  Hash,
  Link2,
  Loader2,
  Sparkles,
  Search,
  Clock,
  Route as RouteIcon,
  Boxes,
  BarChart3,
  X,
} from "lucide-react";
import { faviconFor, getDomain } from "@/lib/url";

const ForceGraph3D = lazy(() =>
  import("react-force-graph-3d").then((m) => ({ default: m.default as any })),
) as any;

// Planet palette — 8 named tag groups
const PLANETS = [
  { name: "Saturn Gold", color: "#fbbf24", ring: "#f59e0b" },
  { name: "Mars Red", color: "#ef4444", ring: "#b91c1c" },
  { name: "Pluto Purple", color: "#a78bfa", ring: "#7c3aed" },
  { name: "Uranus Cyan", color: "#22d3ee", ring: "#0891b2" },
  { name: "Neptune Blue", color: "#3b82f6", ring: "#1d4ed8" },
  { name: "Earth Green", color: "#34d399", ring: "#059669" },
  { name: "Jupiter Orange", color: "#fb923c", ring: "#ea580c" },
  { name: "Venus Pink", color: "#f472b6", ring: "#db2777" },
];

type GNode = {
  id: string;
  label: string;
  count: number;
  val: number;
  group: number;
  color: string;
  ring: string;
  firstSeen: number;
};
type GLink = { source: string; target: string; value: number };

// Build a planet mesh: sphere + tilted ring + label sprite
function buildPlanetObject(node: GNode, highlighted: boolean) {
  const group = new THREE.Group();
  const radius = Math.max(2.5, Math.sqrt(node.count) * 2.5);

  // Glow halo
  const haloMat = new THREE.SpriteMaterial({
    color: new THREE.Color(node.color),
    opacity: highlighted ? 0.55 : 0.28,
    transparent: true,
    depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(radius * 4, radius * 4, 1);
  group.add(halo);

  // Planet sphere
  const sphereGeo = new THREE.SphereGeometry(radius, 24, 24);
  const sphereMat = new THREE.MeshBasicMaterial({ color: node.color });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  group.add(sphere);

  // Orbital ring (one or two, count-based, brighter when more connections)
  const ringCount = Math.min(2, 1 + Math.floor(node.count / 6));
  for (let i = 0; i < ringCount; i++) {
    const inner = radius * (1.6 + i * 0.5);
    const outer = inner + Math.max(0.35, radius * 0.18);
    const ringGeo = new THREE.RingGeometry(inner, outer, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: node.ring,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: highlighted ? 0.95 : 0.55 + Math.min(0.35, node.count / 30),
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.4 + i * 0.25;
    ring.rotation.y = i * 0.4;
    group.add(ring);
  }

  // Label
  const sprite = new SpriteText(node.label);
  sprite.color = "#cbd5e1";
  sprite.backgroundColor = false as unknown as string;
  sprite.textHeight = Math.max(2, radius * 0.55);
  sprite.fontFace = "Inter, ui-sans-serif, system-ui";
  sprite.fontWeight = "500";
  sprite.position.set(0, -radius * 2.6, 0);
  group.add(sprite);

  return group;
}

export function TopicGraph3D({
  links,
  clusters,
  onClustersChange,
}: {
  links: LinkRow[];
  clusters?: boolean;
  onClustersChange?: (v: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 800, h: 620 });
  const [mounted, setMounted] = useState(false);
  const [openTag, setOpenTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [days, setDays] = useState<number>(365); // time travel window
  const [pathA, setPathA] = useState<string>("");
  const [pathB, setPathB] = useState<string>("");
  const [internalClusters, setInternalClusters] = useState(false);
  const showClusters = clusters ?? internalClusters;
  const setShowClusters = (v: boolean) => {
    if (onClustersChange) onClustersChange(v);
    else setInternalClusters(v);
  };
  const [hoverHighlight, setHoverHighlight] = useState<Set<string>>(new Set());

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: Math.max(540, Math.min(760, el.clientWidth * 0.6)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, edges, byTag, adjacency } = useMemo(() => {
    const cutoff = Date.now() - days * 86400_000;
    const active = links.filter((l) => !l.deleted_at && new Date(l.created_at).getTime() >= cutoff);
    const tagCount = new Map<string, number>();
    const tagFirst = new Map<string, number>();
    const byTag = new Map<string, LinkRow[]>();
    const cooc = new Map<string, number>();

    active.forEach((l) => {
      const tags = (l.tags ?? []).filter(Boolean);
      const ts = new Date(l.created_at).getTime();
      tags.forEach((t) => {
        tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
        tagFirst.set(t, Math.min(tagFirst.get(t) ?? Infinity, ts));
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

    // Stable group assignment by hash of tag name → planet palette
    const hashGroup = (s: string) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return h % PLANETS.length;
    };

    const nodes: GNode[] = top.map(([t, c]) => {
      const g = hashGroup(t);
      return {
        id: t,
        label: t,
        count: c,
        val: Math.max(1, Math.sqrt(c) * 4),
        group: g,
        color: PLANETS[g].color,
        ring: PLANETS[g].ring,
        firstSeen: tagFirst.get(t) ?? Date.now(),
      };
    });

    const edges: GLink[] = [];
    const adjacency = new Map<string, Map<string, number>>();
    cooc.forEach((v, k) => {
      const [a, b] = k.split("\u0000");
      if (!allowed.has(a) || !allowed.has(b)) return;
      edges.push({ source: a, target: b, value: v });
      if (!adjacency.has(a)) adjacency.set(a, new Map());
      if (!adjacency.has(b)) adjacency.set(b, new Map());
      adjacency.get(a)!.set(b, v);
      adjacency.get(b)!.set(a, v);
    });

    return { nodes, edges, byTag, adjacency };
  }, [links, days]);

  // Cluster mode: re-color by connected component instead of hash
  const displayNodes = useMemo(() => {
    if (!showClusters) return nodes;
    const seen = new Map<string, number>();
    let cluster = 0;
    nodes.forEach((n) => {
      if (seen.has(n.id)) return;
      const stack = [n.id];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.set(cur, cluster);
        const adj = adjacency.get(cur);
        if (adj)
          adj.forEach((_, nb) => {
            if (!seen.has(nb)) stack.push(nb);
          });
      }
      cluster++;
    });
    return nodes.map((n) => {
      const c = (seen.get(n.id) ?? 0) % PLANETS.length;
      return { ...n, group: c, color: PLANETS[c].color, ring: PLANETS[c].ring };
    });
  }, [nodes, adjacency, showClusters]);

  // Path finder: BFS shortest path
  const pathSet = useMemo(() => {
    if (!pathA || !pathB || pathA === pathB) return new Set<string>();
    const queue: string[] = [pathA];
    const prev = new Map<string, string | null>([[pathA, null]]);
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === pathB) break;
      const adj = adjacency.get(cur);
      if (!adj) continue;
      adj.forEach((_, nb) => {
        if (!prev.has(nb)) {
          prev.set(nb, cur);
          queue.push(nb);
        }
      });
    }
    if (!prev.has(pathB)) return new Set<string>();
    const path = new Set<string>();
    let cur: string | null = pathB;
    while (cur) {
      path.add(cur);
      cur = prev.get(cur) ?? null;
    }
    return path;
  }, [pathA, pathB, adjacency]);

  // Search highlight
  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(displayNodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
  }, [search, displayNodes]);

  const highlightSet = useMemo(() => {
    const s = new Set<string>();
    pathSet.forEach((x) => s.add(x));
    searchHits.forEach((x) => s.add(x));
    hoverHighlight.forEach((x) => s.add(x));
    return s;
  }, [pathSet, searchHits, hoverHighlight]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      fg.d3Force?.("charge")?.strength?.(-110);
      fg.d3Force?.("link")?.distance?.((l: any) => 40 + 80 / Math.max(1, l.value));
      // Starfield background scene
      const scene = fg.scene?.();
      if (scene && !scene.userData._starfield) {
        const starGeo = new THREE.BufferGeometry();
        const N = 1500;
        const arr = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          const r = 1500 + Math.random() * 1500;
          const t = Math.random() * Math.PI * 2;
          const p = Math.acos(2 * Math.random() - 1);
          arr[i * 3] = r * Math.sin(p) * Math.cos(t);
          arr[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
          arr[i * 3 + 2] = r * Math.cos(p);
        }
        starGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        const starMat = new THREE.PointsMaterial({
          color: 0xffffff,
          size: 1.6,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.7,
        });
        const stars = new THREE.Points(starGeo, starMat);
        scene.add(stars);
        scene.userData._starfield = stars;
      }
    } catch {}
  }, [mounted, displayNodes.length]);

  const openLinks = openTag ? (byTag.get(openTag) ?? []) : [];

  // Stats
  const stats = useMemo(() => {
    const total = displayNodes.reduce((s, n) => s + n.count, 0);
    const top5 = [...displayNodes].sort((a, b) => b.count - a.count).slice(0, 5);
    const groups = new Map<number, number>();
    displayNodes.forEach((n) => groups.set(n.group, (groups.get(n.group) ?? 0) + 1));
    return { topics: displayNodes.length, mentions: total, edges: edges.length, top5, groups };
  }, [displayNodes, edges]);

  if (nodes.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-10 text-center">
        <Hash className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          No topics yet. Save links and let AI tag them — your cosmos will appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="rounded-2xl border border-border/60 bg-[#02030a] overflow-hidden relative"
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
              graphData={{ nodes: displayNodes, links: edges }}
              backgroundColor="#02030a"
              nodeLabel={(n: any) => `${n.label} · ${n.count} link${n.count > 1 ? "s" : ""}`}
              nodeThreeObject={(n: any) => buildPlanetObject(n as GNode, highlightSet.has(n.id))}
              nodeThreeObjectExtend={false}
              linkColor={(l: any) => {
                const id = (s: any) => (typeof s === "object" ? s.id : s);
                const inPath = pathSet.has(id(l.source)) && pathSet.has(id(l.target));
                return inPath ? "rgba(167,139,250,0.9)" : "rgba(148,163,184,0.25)";
              }}
              linkWidth={(l: any) => {
                const id = (s: any) => (typeof s === "object" ? s.id : s);
                const inPath = pathSet.has(id(l.source)) && pathSet.has(id(l.target));
                return inPath ? 2.5 : Math.min(2, 0.4 + l.value * 0.4);
              }}
              linkOpacity={0.6}
              linkDirectionalParticles={(l: any) => {
                const id = (s: any) => (typeof s === "object" ? s.id : s);
                return pathSet.has(id(l.source)) && pathSet.has(id(l.target)) ? 3 : 1;
              }}
              linkDirectionalParticleWidth={(l: any) => Math.min(2, l.value * 0.5)}
              linkDirectionalParticleSpeed={() => 0.005}
              enableNodeDrag
              showNavInfo={false}
              onNodeHover={(n: any) => {
                if (!n) return setHoverHighlight(new Set());
                const adj = adjacency.get(n.id);
                const s = new Set<string>([n.id]);
                if (adj) adj.forEach((_, k) => s.add(k));
                setHoverHighlight(s);
              }}
              onNodeClick={(n: any) => {
                setOpenTag(n.id);
                const fg = fgRef.current;
                if (fg && n.x != null) {
                  const dist = 140;
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

        {/* Cosmos legend */}
        <aside className="pointer-events-none absolute top-3 right-3 w-[230px] rounded-xl border border-white/10 bg-black/60 backdrop-blur p-3 text-[11px] text-slate-200">
          <div className="flex items-center gap-1.5 font-mono uppercase tracking-widest text-[10px] text-amber-300">
            <Sparkles className="h-3 w-3" /> Cosmos legend
          </div>
          <div className="mt-2.5">
            <div className="font-semibold text-slate-100">Node Size = Link Count</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-500" />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />
              <span className="inline-block h-3.5 w-3.5 rounded-full bg-slate-300" />
              <span className="ml-1 text-slate-400">few → many</span>
            </div>
          </div>
          <div className="mt-2.5">
            <div className="font-semibold text-slate-100">Color = Tag Group</div>
            <div className="mt-1 grid grid-cols-2 gap-y-1 gap-x-2">
              {PLANETS.map((p) => (
                <div key={p.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span className="truncate text-slate-300">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2.5">
            <div className="font-semibold text-slate-100">Rings = Connections</div>
            <div className="text-slate-400">Brighter rings = more active</div>
          </div>
          <div className="mt-2.5">
            <div className="font-semibold text-slate-100">Edges = Co-occurrence</div>
            <div className="text-slate-400">Tags appearing together on links</div>
          </div>
        </aside>

        {/* Bottom toolbar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/10 bg-black/60 backdrop-blur px-2 py-1.5 text-slate-200 text-xs">
          {/* Search */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/10">
                <Search className="h-3.5 w-3.5" /> Search
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-72">
              <div className="space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Find a topic
                </div>
                <Input
                  autoFocus
                  placeholder="Type a tag…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {[...searchHits].slice(0, 8).map((id) => {
                    const n = displayNodes.find((x) => x.id === id);
                    if (!n) return null;
                    return (
                      <button
                        key={id}
                        onClick={() => setOpenTag(id)}
                        className="w-full flex items-center gap-2 text-left px-2 py-1 rounded hover:bg-muted text-sm"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: n.color }} />
                        <span className="font-mono">{n.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{n.count}</span>
                      </button>
                    );
                  })}
                  {search && searchHits.size === 0 && (
                    <div className="text-xs text-muted-foreground px-2 py-2">No matches.</div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Time Travel */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/10">
                <Clock className="h-3.5 w-3.5" /> Time Travel
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-72">
              <div className="space-y-3">
                <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Show links from the last
                </div>
                <div className="text-2xl font-display font-semibold tabular-nums">
                  {days >= 365 ? "All time" : `${days} days`}
                </div>
                <Slider
                  min={7}
                  max={365}
                  step={1}
                  value={[days]}
                  onValueChange={(v) => setDays(v[0])}
                />
                <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                  <span>7d</span>
                  <span>90d</span>
                  <span>All</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Path Finder */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/10 ${pathSet.size > 0 ? "text-violet-300" : ""}`}
              >
                <RouteIcon className="h-3.5 w-3.5" /> Path Finder
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-72">
              <div className="space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Trace a path between topics
                </div>
                <select
                  className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                  value={pathA}
                  onChange={(e) => setPathA(e.target.value)}
                >
                  <option value="">From…</option>
                  {displayNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                  value={pathB}
                  onChange={(e) => setPathB(e.target.value)}
                >
                  <option value="">To…</option>
                  {displayNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-muted-foreground">
                  {pathA && pathB
                    ? pathSet.size > 0
                      ? `Path: ${pathSet.size} hops`
                      : "No connection between these topics."
                    : "Pick two topics."}
                </div>
                {(pathA || pathB) && (
                  <button
                    onClick={() => {
                      setPathA("");
                      setPathB("");
                    }}
                    className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Clusters */}
          <button
            onClick={() => setShowClusters(!showClusters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/10 ${showClusters ? "bg-white/10 text-cyan-300" : ""}`}
          >
            <Boxes className="h-3.5 w-3.5" /> Clusters
          </button>

          {/* Stats */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/10">
                <BarChart3 className="h-3.5 w-3.5" /> Stats
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-64">
              <div className="space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  Cosmos stats
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="font-display text-lg font-semibold">{stats.topics}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Planets</div>
                  </div>
                  <div>
                    <div className="font-display text-lg font-semibold">{stats.edges}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Edges</div>
                  </div>
                  <div>
                    <div className="font-display text-lg font-semibold">{stats.mentions}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">Mentions</div>
                  </div>
                </div>
                <div className="pt-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                    Top topics
                  </div>
                  <ul className="space-y-1">
                    {stats.top5.map((n) => (
                      <li key={n.id} className="flex items-center gap-2 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ background: n.color }} />
                        <span className="font-mono truncate">{n.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{n.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] uppercase tracking-widest font-mono text-slate-400/70">
          ◐ Drag to orbit · Scroll to zoom · Click nodes
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
                    <div className="text-sm font-medium truncate">{l.title ?? l.url}</div>
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
