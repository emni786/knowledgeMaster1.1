import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Pin, RefreshCw, Trash2, LogOut, Settings, Sparkles,
  LayoutGrid, List, Hash, CheckSquare, Activity, Compass, Network,
  BarChart3, Newspaper, Library as LibraryIcon, ChevronLeft, ChevronRight,
  X, ExternalLink, Star, RotateCcw, MoreHorizontal, Filter, FileText,
  Video, Github, BookOpen, Wrench, MessagesSquare, HelpCircle, Inbox,
  Upload, Download, Tag, Keyboard, AlertCircle, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Wordmark, Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PageTabs } from "@/components/PageTabs";
import { useLocalStorage } from "@/lib/local-storage";
import { faviconFor, getDomain } from "@/lib/url";
import {
  fetchLinks, addLinks, updateLink, softDeleteLink, softDeleteMany,
  togglePin, retryAnalysis, restoreLink, permanentlyDelete, emptyTrash, bulkAddTag,
} from "@/lib/api/links";
import { fetchCollections, createCollection, deleteCollection } from "@/lib/api/collections";
import type { LinkRow, FilterState, ContentType, LinkStatus } from "@/lib/types";
import { DEFAULT_FILTERS } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Library — Knowledgemaster" },
      { name: "description", content: "Browse, search, filter, and manage your AI-tagged link library. Bulk actions, collections, and smart organization for every saved link." },
      { property: "og:title", content: "Library — Knowledgemaster" },
    ],
    links: [{ rel: "canonical", href: "/library" }],
  }),
  component: LibraryPage,
});

const TYPE_ICON: Record<ContentType, typeof FileText> = {
  article: FileText, video: Video, repo: Github, docs: BookOpen,
  tool: Wrench, thread: MessagesSquare, other: LibraryIcon,
};

const TYPE_DESCRIPTION: Record<ContentType, string> = {
  article: "Article — written post, blog, or news story",
  video: "Video — video content from YouTube, Vimeo, etc.",
  repo: "Repo — code repository on GitHub or similar",
  docs: "Docs — documentation, guide, or reference",
  tool: "Tool — app, service, or utility",
  thread: "Thread — discussion on Twitter, Reddit, HN, etc.",
  other: "Other — uncategorized link",
};

function TypeIcon({ type, className }: { type: ContentType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          onClick={(e) => e.stopPropagation()}
          className="inline-flex shrink-0"
          aria-label={TYPE_DESCRIPTION[type]}
        >
          <Icon className={className} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{TYPE_DESCRIPTION[type]}</TooltipContent>
    </Tooltip>
  );
}

const NAV = [
  { to: "/library", label: "Library", icon: LibraryIcon },
  { to: "/dashboard", label: "Dashboard", icon: Activity },
  { to: "/discover", label: "Discover", icon: Compass },
  
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/digest", label: "Digest", icon: Newspaper },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function LibraryPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [collapsed, setCollapsed] = useLocalStorage("xn:sidebar-collapsed", false);
  const [view, setView] = useLocalStorage<"list" | "grid">("xn:view", "list");
  const [showNumbers, setShowNumbers] = useLocalStorage("xn:numbers", false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  type LibraryTab = "all" | "pinned" | "failed" | "trash";
  const tab: LibraryTab = filters.showDeleted
    ? "trash"
    : filters.status === "failed"
      ? "failed"
      : filters.pinnedOnly
        ? "pinned"
        : "all";
  const setTab = (t: LibraryTab) => {
    if (t === "trash") setFilters({ ...filters, showDeleted: true, pinnedOnly: false, status: "all", showDuplicates: false });
    else if (t === "pinned") setFilters({ ...filters, showDeleted: false, pinnedOnly: true, status: "all", showDuplicates: false });
    else if (t === "failed") setFilters({ ...filters, showDeleted: false, pinnedOnly: false, status: "failed", showDuplicates: false });
    else setFilters({ ...filters, showDeleted: false, pinnedOnly: false, status: "all", showDuplicates: false });
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(filters.query), 300);
    return () => clearTimeout(t);
  }, [filters.query]);

  const linksQuery = useQuery({ queryKey: ["links"], queryFn: fetchLinks });
  const collectionsQuery = useQuery({ queryKey: ["collections-list"], queryFn: fetchCollections });
  const allLinks = linksQuery.data ?? [];

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("links-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "links" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["links"] });
        if (payload.eventType === "INSERT") toast.success("New link added");
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Track status transitions (pending → ready / failed) for inline feedback
  const prevStatusRef = useRef<Map<string, LinkStatus>>(new Map());
  useEffect(() => {
    const prev = prevStatusRef.current;
    const next = new Map<string, LinkStatus>();
    for (const l of allLinks) {
      next.set(l.id, l.status);
      const before = prev.get(l.id);
      if (before === "pending" && l.status === "ready") {
        toast.success(`Analyzed: ${l.title || l.domain || l.url}`);
      } else if (before === "pending" && l.status === "failed") {
        toast.error(`Analysis failed: ${l.domain || l.url}`);
      }
    }
    prevStatusRef.current = next;
  }, [allLinks]);

  const stats = useMemo(() => {
    const active = allLinks.filter((l) => !l.deleted_at);
    const seen = new Map<string, number>();
    active.forEach((l) => {
      const k = l.normalized_url ?? l.url;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    });
    const duplicates = Array.from(seen.values()).filter((n) => n > 1).length;
    const byType: Record<ContentType, number> = {
      article: 0, video: 0, repo: 0, docs: 0, tool: 0, thread: 0, other: 0,
    };
    active.forEach((l) => { byType[l.content_type] = (byType[l.content_type] ?? 0) + 1; });
    return {
      all: active.length,
      pending: active.filter((l) => l.status === "pending").length,
      ready: active.filter((l) => l.status === "ready").length,
      failed: active.filter((l) => l.status === "failed").length,
      duplicates,
      deleted: allLinks.filter((l) => l.deleted_at).length,
      byType,
    };
  }, [allLinks]);

  const visible = useMemo(() => {
    let list = allLinks.filter((l) => (filters.showDeleted ? !!l.deleted_at : !l.deleted_at));
    if (filters.contentType !== "all") list = list.filter((l) => l.content_type === filters.contentType);
    if (filters.status !== "all") list = list.filter((l) => l.status === filters.status);
    if (filters.pinnedOnly) list = list.filter((l) => l.pinned);
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter((l) =>
        (l.title ?? "").toLowerCase().includes(q) ||
        (l.summary ?? "").toLowerCase().includes(q) ||
        (l.url ?? "").toLowerCase().includes(q) ||
        (l.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }
    if (filters.showDuplicates) {
      const seen = new Map<string, LinkRow[]>();
      list.forEach((l) => {
        const k = l.normalized_url ?? l.url;
        const arr = seen.get(k) ?? []; arr.push(l); seen.set(k, arr);
      });
      list = Array.from(seen.values()).filter((arr) => arr.length > 1).flat();
    }
    list.sort((a, b) => {
      switch (filters.sort) {
        case "oldest": return a.created_at.localeCompare(b.created_at);
        case "title-asc": return (a.title ?? "").localeCompare(b.title ?? "");
        case "title-desc": return (b.title ?? "").localeCompare(a.title ?? "");
        case "domain-asc": return (a.domain ?? "").localeCompare(b.domain ?? "");
        default: return b.created_at.localeCompare(a.created_at);
      }
    });
    // pinned first
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return list;
  }, [allLinks, filters, debouncedQuery]);

  const groups = useMemo(() => ({
    ready: visible.filter((l) => l.status === "ready"),
    pending: visible.filter((l) => l.status === "pending"),
    failed: visible.filter((l) => l.status === "failed"),
  }), [visible]);

  const selectedLink = useMemo(() => allLinks.find((l) => l.id === selected) ?? null, [allLinks, selected]);

  // Mutations
  const addMut = useMutation({
    mutationFn: addLinks,
    onSuccess: (rows) => {
      qc.invalidateQueries({ queryKey: ["links"] });
      const n = Array.isArray(rows) ? rows.length : 1;
      toast.success(n > 1 ? `Added ${n} links` : "Link saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: softDeleteLink,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["links"] }); setSelected(null); toast.success("Moved to trash"); },
  });
  const pinMut = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => togglePin(id, pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["links"] }),
  });

  const handleAdd = (raw: string) => {
    const urls = Array.from(new Set(
      raw.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s))
    ));
    if (!urls.length) return toast.error("Enter one or more valid URLs");
    addMut.mutate(urls);
  };


  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const handleSelectLink = (id: string) => {
    setSelected(id);
    if (window.innerWidth < 1024) setMobileDetailOpen(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "?") { e.preventDefault(); setShortcutsOpen(true); }
      else if (e.key === "g") { e.preventDefault(); setView(view === "list" ? "grid" : "list"); }
      else if (e.key === "Escape") { setSelected(null); setMobileDetailOpen(false); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = visible.findIndex((l) => l.id === selected);
        const next = e.key === "ArrowDown" ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx - 1);
        if (visible[next]) setSelected(visible[next].id);
      } else if (e.key === "Enter" && selected && selectedLink) {
        window.open(selectedLink.url, "_blank");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selected, selectedLink, view, setView]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background text-foreground">
        {/* Mobile header */}
        <MobileHeader
          email={user?.email}
          onAdd={handleAdd}
          onSignOut={handleSignOut}
        />

        <div className={`hidden lg:grid ${collapsed ? "lg:grid-cols-[64px_1fr]" : "lg:grid-cols-[280px_1fr]"} min-h-screen transition-[grid-template-columns]`}>
          {/* Left sidebar */}
          <aside className="border-r border-border/50 bg-sidebar text-sidebar-foreground flex flex-col h-screen sticky top-0">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <Wordmark collapsed={collapsed} />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCollapsed(!collapsed)}>
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </div>
            {!collapsed && user?.email && (
              <div className="px-4 py-2 text-[11px] font-mono text-muted-foreground truncate border-b border-border/50">
                {user.email}
              </div>
            )}
            <nav className="px-2 py-3 space-y-0.5">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-primary/10 hover:text-primary transition-colors font-medium"
                  activeProps={{ className: "bg-primary/10 text-primary" }}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              ))}
            </nav>

            {!collapsed && (
              <div className="px-4 py-3 border-t border-border/50 grid grid-cols-3 gap-1.5">
                <MiniPill label="All" value={stats.all} />
                <MiniPill label="Pin" value={allLinks.filter((l) => !l.deleted_at && l.pinned).length} />
                <MiniPill label="Fail" value={stats.failed} destructive={stats.failed > 0} />
              </div>
            )}

            {!collapsed && (
              <CollectionsBlock
                collections={collectionsQuery.data ?? []}
                activeId={filters.collectionId}
                onSelect={(id) => setFilters({ ...filters, collectionId: id })}
              />
            )}

            <div className="mt-auto p-3 border-t border-border/50 flex items-center gap-1">
              <ThemeToggle />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary" onClick={() => setShortcutsOpen(true)}>
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Shortcuts (?)</TooltipContent>
              </Tooltip>
              <Link to="/settings">
                <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary">
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-destructive/10 hover:text-destructive ml-auto" onClick={handleSignOut}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sign out</TooltipContent>
              </Tooltip>
            </div>
          </aside>

          {/* Center */}
          <main className="flex flex-col min-h-screen">
            <CenterToolbar
              ref={searchRef}
              filters={filters}
              setFilters={setFilters}
              view={view}
              setView={setView}
              showNumbers={showNumbers}
              setShowNumbers={setShowNumbers}
              selectMode={selectMode}
              setSelectMode={setSelectMode}
              onAdd={handleAdd}
              addPending={addMut.isPending}
              onSmartSearch={() => setSmartOpen(true)}
              onImport={() => setImportOpen(true)}
              onRefresh={() => linksQuery.refetch()}
              onOpenFilters={() => setFiltersOpen(true)}
            />

            <div className="sticky top-[120px] z-10 bg-background/80 backdrop-blur border-b border-border/50 px-6">
              <PageTabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: "all", label: "All", icon: Inbox, badge: stats.all },
                  { id: "pinned", label: "Pinned", icon: Pin, badge: allLinks.filter((l) => !l.deleted_at && l.pinned).length },
                  { id: "failed", label: "Failed", icon: AlertCircle, badge: stats.failed },
                  { id: "trash", label: "Trash", icon: Trash2, badge: stats.deleted },
                ]}
              />
            </div>
            {selectMode && selectedIds.size > 0 && (
              <div className="sticky top-[120px] z-20 px-6 py-2 bg-primary/10 border-b border-primary/20 flex items-center gap-2 animate-fade-in">
                <span className="font-mono text-xs">{selectedIds.size} selected</span>
                <Button size="sm" variant="ghost" className="h-7 font-mono text-xs" onClick={() => setBulkTagOpen(true)}>
                  <Tag className="h-3 w-3 mr-1" />Add tag
                </Button>
                <Button size="sm" variant="ghost" className="h-7 font-mono text-xs text-destructive" onClick={async () => {
                  await softDeleteMany(Array.from(selectedIds));
                  qc.invalidateQueries({ queryKey: ["links"] });
                  setSelectedIds(new Set());
                  setSelectMode(false);
                  toast.success("Deleted");
                }}>
                  <Trash2 className="h-3 w-3 mr-1" />Delete
                </Button>
                <Button size="sm" variant="ghost" className="h-7 font-mono text-xs ml-auto" onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}>
                  Cancel
                </Button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
              {linksQuery.isLoading ? (
                <SkeletonList />
              ) : visible.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-6">
                  {groups.ready.length > 0 && (
                    <Section title="Ready" count={groups.ready.length} icon={Sparkles}>
                      <LinkGrid links={groups.ready} view={view} showNumbers={showNumbers} numberOffset={0} selectMode={selectMode} selectedIds={selectedIds} toggleSelected={toggleSelected} selected={selected} onSelect={handleSelectLink} onPin={(id, p) => pinMut.mutate({ id, pinned: !p })} />
                    </Section>
                  )}
                  {groups.pending.length > 0 && (
                    <Section title="Pending" count={groups.pending.length} icon={Loader2} iconClass="animate-spin">
                      <LinkGrid links={groups.pending} view={view} showNumbers={showNumbers} numberOffset={groups.ready.length} selectMode={selectMode} selectedIds={selectedIds} toggleSelected={toggleSelected} selected={selected} onSelect={handleSelectLink} onPin={(id, p) => pinMut.mutate({ id, pinned: !p })} />
                    </Section>
                  )}
                  {groups.failed.length > 0 && (
                    <Section title="Failed" count={groups.failed.length} icon={AlertCircle} iconClass="text-destructive">
                      <LinkGrid links={groups.failed} view={view} showNumbers={showNumbers} numberOffset={groups.ready.length + groups.pending.length} selectMode={selectMode} selectedIds={selectedIds} toggleSelected={toggleSelected} selected={selected} onSelect={handleSelectLink} onPin={(id, p) => pinMut.mutate({ id, pinned: !p })} />
                    </Section>
                  )}
                </div>
              )}
            </div>
          </main>

        </div>

        {/* Mobile body */}
        <div className="lg:hidden">
          <div className="px-4 py-3 space-y-3">
            <AddLinkInput onAdd={handleAdd} loading={addMut.isPending} />
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search links... (press /)"
                  className="h-9 pl-9 font-mono text-sm"
                  value={filters.query}
                  onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                />
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => linksQuery.refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <StatCard label="All" value={stats.all} />
              <StatCard label="Ready" value={stats.ready} tone="primary" />
              <StatCard label="Pending" value={stats.pending} tone="muted" />
            </div>
            {linksQuery.isLoading ? <SkeletonList /> : visible.length === 0 ? <EmptyState /> : (
              <div className="space-y-2">
                {visible.map((l, i) => (
                  <LinkCard
                    key={l.id} link={l} index={i} view="list" showNumbers={false}
                    selected={selected === l.id} onSelect={() => handleSelectLink(l.id)}
                    onPin={(p) => pinMut.mutate({ id: l.id, pinned: !p })}
                    selectMode={false} isChecked={false} onCheck={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
          <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0">
              {selectedLink && (
                <DetailPanel
                  link={selectedLink}
                  onClose={() => setMobileDetailOpen(false)}
                  onDelete={(id) => { deleteMut.mutate(id); setMobileDetailOpen(false); }}
                  onPin={(id, p) => pinMut.mutate({ id, pinned: !p })}
                  onRetry={(id) => retryAnalysis(id).then(() => qc.invalidateQueries({ queryKey: ["links"] }))}
                  onUpdate={async (id, patch) => { await updateLink(id, patch); qc.invalidateQueries({ queryKey: ["links"] }); }}
                  allLinks={allLinks}
                />
              )}
            </SheetContent>
          </Sheet>
        </div>

        <RecycleBinDialog open={recycleOpen} onOpenChange={setRecycleOpen} links={allLinks.filter((l) => l.deleted_at)} onRefresh={() => qc.invalidateQueries({ queryKey: ["links"] })} />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleAdd} />
        <SmartSearchDialog open={smartOpen} onOpenChange={setSmartOpen} links={allLinks} onPick={(id) => { setSelected(id); setSmartOpen(false); }} />
        <BulkTagDialog open={bulkTagOpen} onOpenChange={setBulkTagOpen} onApply={async (tag) => {
          await bulkAddTag(Array.from(selectedIds), tag);
          qc.invalidateQueries({ queryKey: ["links"] });
          setBulkTagOpen(false); setSelectMode(false); setSelectedIds(new Set());
          toast.success(`Added "${tag}" to ${selectedIds.size} links`);
        }} />
      </div>
    </TooltipProvider>
  );
}

function MobileHeader({ email, onAdd, onSignOut }: { email?: string; onAdd: (raw: string) => void; onSignOut: () => void }) {
  return (
    <header className="lg:hidden glass sticky top-0 z-30 border-b border-border/50 px-4 py-3 flex items-center gap-2">
      <Logo />
      <div className="flex flex-col leading-tight min-w-0 flex-1">
        <span className="font-mono text-sm font-semibold">Knowledgemaster</span>
        {email && <span className="text-[10px] text-muted-foreground truncate">{email}</span>}
      </div>
      <ThemeToggle />
      <Link to="/settings"><Button variant="ghost" size="icon" className="h-9 w-9"><Settings className="h-4 w-4" /></Button></Link>
      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={onSignOut}><LogOut className="h-4 w-4" /></Button>
    </header>
  );
}

const CenterToolbar = (() => {
  const Inner = (
    {
      filters, setFilters, view, setView, showNumbers, setShowNumbers,
      selectMode, setSelectMode, onAdd, addPending, onSmartSearch, onRefresh, onOpenFilters,
    }: {
      filters: FilterState; setFilters: (f: FilterState) => void;
      view: "list" | "grid"; setView: (v: "list" | "grid") => void;
      showNumbers: boolean; setShowNumbers: (v: boolean) => void;
      selectMode: boolean; setSelectMode: (v: boolean) => void;
      onAdd: (raw: string) => void; addPending: boolean;
      onSmartSearch: () => void; onImport: () => void; onRefresh: () => void;
      onOpenFilters: () => void;
    },
    ref: React.Ref<HTMLInputElement>,
  ) => {
    return (
      <div className="glass sticky top-0 z-20 border-b border-border/50 px-6 py-3 space-y-3">
        <AddLinkInput onAdd={onAdd} loading={addPending} />
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={ref}
              placeholder="Search links... (press /)"
              className="h-9 pl-9 font-mono text-sm bg-background/60"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setView("list")}>
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>List view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setView("grid")}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Grid view (g)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={showNumbers ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setShowNumbers(!showNumbers)}>
                  <Hash className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle numbers</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={selectMode ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setSelectMode(!selectMode)}>
                  <CheckSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select mode</TooltipContent>
            </Tooltip>
            <div className="w-px h-5 bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary" onClick={onSmartSearch}>
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Smart search</TooltipContent>
            </Tooltip>
            <Link to="/discover">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary">
                    <Compass className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Discover</TooltipContent>
              </Tooltip>
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary" onClick={() => toast.success("All links healthy")}>
                  <Activity className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Link health</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary" onClick={onRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary" onClick={onOpenFilters}>
                  <Filter className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filters</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    );
  };
  return Object.assign(
    // eslint-disable-next-line react/display-name
    (props: Parameters<typeof Inner>[0] & { ref?: React.Ref<HTMLInputElement> }) => Inner(props, props.ref ?? null),
    { displayName: "CenterToolbar" },
  );
})() as unknown as React.ForwardRefExoticComponent<{
  filters: FilterState; setFilters: (f: FilterState) => void;
  view: "list" | "grid"; setView: (v: "list" | "grid") => void;
  showNumbers: boolean; setShowNumbers: (v: boolean) => void;
  selectMode: boolean; setSelectMode: (v: boolean) => void;
  onAdd: (raw: string) => void; addPending: boolean;
  onSmartSearch: () => void; onImport: () => void; onRefresh: () => void;
  onOpenFilters: () => void;
} & React.RefAttributes<HTMLInputElement>>;

function AddLinkInput({ onAdd, loading }: { onAdd: (raw: string) => void; loading: boolean }) {
  const [val, setVal] = useState("");
  const detected = useMemo(
    () => Array.from(new Set(val.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)))),
    [val]
  );
  const isMulti = val.includes("\n") || detected.length > 1;
  const submit = () => { if (val.trim()) { onAdd(val); setVal(""); } };
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex items-start gap-2 rounded-2xl border border-border/50 bg-card px-3 py-1.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition"
    >
      <Plus className="h-4 w-4 text-primary shrink-0 mt-1.5" />
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/\n|,/.test(text) || (text.match(/https?:\/\//g)?.length ?? 0) > 1) {
            e.preventDefault();
            setVal((prev) => (prev ? prev + "\n" : "") + text);
          }
        }}
        rows={isMulti ? Math.min(6, Math.max(2, val.split("\n").length)) : 1}
        placeholder="Paste one URL or many (newlines or commas). Enter to add, Shift+Enter for newline."
        className="flex-1 bg-transparent outline-none font-mono text-sm placeholder:text-muted-foreground/60 resize-none py-1 leading-5"
      />
      <div className="flex items-center gap-2 mt-0.5">
        {detected.length > 1 && (
          <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">{detected.length} URLs</span>
        )}
        <Button type="submit" size="sm" className="h-7 font-mono text-[11px]" disabled={loading || !detected.length}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : detected.length > 1 ? `Add ${detected.length}` : "Add"}
        </Button>
      </div>
    </form>
  );
}

function StatCard({
  label, value, tone, active, onClick,
}: { label: string; value: number; tone?: "primary" | "muted" | "destructive"; active?: boolean; onClick?: () => void }) {
  const toneClass =
    tone === "primary" ? "text-primary" :
    tone === "destructive" ? "text-destructive" :
    tone === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border border-border/50 bg-card px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-primary/5 ${active ? "border-primary/40 bg-primary/5" : ""}`}
    >
      <div className={`font-mono text-[10px] uppercase tracking-widest text-muted-foreground`}>{label}</div>
      <div className={`font-mono text-base font-semibold ${toneClass}`}>{value}</div>
    </button>
  );
}

function CollectionsBlock({
  collections, activeId, onSelect,
}: { collections: { id: string; name: string }[]; activeId: string | null; onSelect: (id: string | null) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const list = collections;
  return (
    <div className="px-4 py-3 border-t border-border/50">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Collections</div>
      <div className="space-y-0.5 max-h-40 overflow-auto scrollbar-thin">
        <button
          onClick={() => onSelect(null)}
          className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono hover:bg-primary/10 hover:text-primary ${activeId === null ? "bg-primary/10 text-primary" : ""}`}
        >
          # All links
        </button>
        {list.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono hover:bg-primary/10 hover:text-primary truncate ${activeId === c.id ? "bg-primary/10 text-primary" : ""}`}
          >
            # {c.name}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await createCollection(name.trim());
          setName("");
          qc.invalidateQueries({ queryKey: ["collections-list"] });
          toast.success("Collection created");
        }}
        className="mt-2 flex gap-1"
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection" className="h-7 text-xs font-mono" />
        <Button type="submit" size="icon" variant="ghost" className="h-7 w-7"><Plus className="h-3 w-3" /></Button>
      </form>
    </div>
  );
}

function Section({ title, count, icon: Icon, iconClass, children }: { title: string; count: number; icon: typeof FileText; iconClass?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="animate-fade-in">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 mb-2 group">
        <Icon className={`h-3.5 w-3.5 text-primary ${iconClass ?? ""}`} />
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground group-hover:text-primary">{title}</span>
        <span className="font-mono text-[11px] text-muted-foreground/70">({count})</span>
      </button>
      {open && children}
    </section>
  );
}

function LinkGrid({
  links, view, showNumbers, numberOffset, selectMode, selectedIds, toggleSelected, selected, onSelect, onPin,
}: {
  links: LinkRow[]; view: "list" | "grid"; showNumbers: boolean; numberOffset: number;
  selectMode: boolean; selectedIds: Set<string>; toggleSelected: (id: string) => void;
  selected: string | null; onSelect: (id: string) => void; onPin: (id: string, p: boolean) => void;
}) {
  return (
    <div className={view === "grid" ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" : "space-y-1.5"}>
      {links.map((l, i) => (
        <LinkCard
          key={l.id}
          link={l}
          index={numberOffset + i + 1}
          view={view}
          showNumbers={showNumbers}
          selected={selected === l.id}
          onSelect={() => onSelect(l.id)}
          onPin={(p) => onPin(l.id, p)}
          selectMode={selectMode}
          isChecked={selectedIds.has(l.id)}
          onCheck={() => toggleSelected(l.id)}
        />
      ))}
    </div>
  );
}

function LinkCard({
  link, index, view, showNumbers, selected, onSelect, onPin, selectMode, isChecked, onCheck,
}: {
  link: LinkRow; index: number; view: "list" | "grid"; showNumbers: boolean;
  selected: boolean; onSelect: () => void; onPin: (p: boolean) => void;
  selectMode: boolean; isChecked: boolean; onCheck: () => void;
}) {
  const Icon = TYPE_ICON[link.content_type];
  const domain = link.domain || getDomain(link.url);
  const ago = link.created_at ? formatDistanceToNow(new Date(link.created_at), { addSuffix: true }) : "";
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected]);

  if (view === "grid") {
    return (
      <button
        ref={ref as React.RefObject<HTMLButtonElement>}
        onClick={selectMode ? onCheck : onSelect}
        aria-pressed={selected}
        data-selected={selected ? "true" : undefined}
        className={`group relative overflow-hidden text-left rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selected ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-md -translate-y-0.5" : "border-border/50 bg-card"}`}
      >
        <div className="flex items-start gap-2 mb-2">
          {selectMode && <Checkbox checked={isChecked} className="mt-1" />}
          <img src={faviconFor(link.url)} alt="" className="h-5 w-5 rounded mt-0.5" loading="lazy" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {showNumbers && <span className="font-mono text-[10px] text-muted-foreground">{index}.</span>}
              <span className="font-mono text-[10px] text-muted-foreground truncate">{domain}</span>
              {link.pinned && <Pin className="h-3 w-3 text-primary fill-primary" />}
            </div>
            <h3 className="font-medium text-sm truncate mt-0.5">{link.title || link.url}</h3>
          </div>
          <TypeIcon type={link.content_type} className="h-4 w-4 text-primary/70" />
        </div>
        {link.summary && <p className="text-xs text-muted-foreground line-clamp-2">{link.summary}</p>}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {link.status === "pending" ? (
            <span className="font-mono text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
            </span>
          ) : link.status === "failed" ? (
            <span className="font-mono text-[10px] text-destructive inline-flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Analysis failed
            </span>
          ) : (
            link.tags.slice(0, 3).map((t) => (
              <span key={t} className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground">#{t}</span>
            ))
          )}
          <span className="font-mono text-[10px] text-muted-foreground/60 ml-auto">{ago}</span>
        </div>
        {link.status === "pending" && <AnalysisProgressBar />}
      </button>
    );
  }

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      onClick={selectMode ? onCheck : onSelect}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      data-selected={selected ? "true" : undefined}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (selectMode ? onCheck : onSelect)(); } }}
      className={`group relative overflow-hidden flex items-center gap-3 rounded-2xl border px-3 py-2 cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selected ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-sm pl-4 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-primary" : "border-border/50 bg-card hover:bg-accent/40"}`}
    >
      {selectMode && <Checkbox checked={isChecked} />}
      {showNumbers && <span className="font-mono text-[10px] text-muted-foreground w-6 text-right">{index}.</span>}
      <img src={faviconFor(link.url)} alt="" className="h-5 w-5 rounded" loading="lazy" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm truncate">{link.title || link.url}</h3>
          {link.pinned && <Pin className="h-3 w-3 text-primary fill-primary shrink-0" />}
          {link.status === "pending" && <Loader2 className="h-3 w-3 text-muted-foreground animate-spin shrink-0" />}
          {link.status === "failed" && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[10px] text-muted-foreground truncate">{domain}</span>
          {link.status === "pending" ? (
            <span className="font-mono text-[10px] text-muted-foreground">Analyzing…</span>
          ) : link.status === "failed" ? (
            <span className="font-mono text-[10px] text-destructive">Analysis failed</span>
          ) : (
            link.tags.slice(0, 4).map((t) => (
              <span key={t} className="font-mono text-[10px] text-primary/80">#{t}</span>
            ))
          )}
        </div>
        {link.summary && link.status === "ready" && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{link.summary}</p>
        )}
      </div>
      <TypeIcon type={link.content_type} className="h-4 w-4 text-primary/70" />
      <button
        onClick={(e) => { e.stopPropagation(); onPin(link.pinned); }}
        className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-primary"
      >
        <Pin className={`h-3.5 w-3.5 ${link.pinned ? "fill-primary text-primary" : ""}`} />
      </button>
      <span className="font-mono text-[10px] text-muted-foreground/60 hidden md:block">{ago}</span>
      {link.status === "pending" && <AnalysisProgressBar />}
    </div>
  );
}

function AnalysisProgressBar() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden bg-primary/10"
    >
      <span className="block h-full w-1/3 rounded-full bg-primary animate-[xn-progress_1.4s_ease-in-out_infinite]" />
    </span>
  );
}

function DetailPanel({
  link, onClose, onDelete, onPin, onRetry, onUpdate, allLinks,
}: {
  link: LinkRow; onClose: () => void;
  onDelete: (id: string) => void; onPin: (id: string, p: boolean) => void;
  onRetry: (id: string) => void; onUpdate: (id: string, patch: Partial<LinkRow>) => Promise<void>;
  allLinks: LinkRow[];
}) {
  const Icon = TYPE_ICON[link.content_type];
  const [tagInput, setTagInput] = useState("");
  const similar = useMemo(() =>
    allLinks
      .filter((l) => l.id !== link.id && !l.deleted_at && (l.domain === link.domain || l.tags.some((t) => link.tags.includes(t))))
      .slice(0, 5),
    [allLinks, link]);

  const addTag = async () => {
    const t = tagInput.trim();
    if (!t) return;
    await onUpdate(link.id, { tags: Array.from(new Set([...link.tags, t])) } as Partial<LinkRow>);
    setTagInput("");
  };
  const removeTag = async (t: string) => {
    await onUpdate(link.id, { tags: link.tags.filter((x) => x !== t) } as Partial<LinkRow>);
  };

  return (
    <div className="animate-slide-in-right p-5 space-y-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Link Detail</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div>
        <div className="flex items-start gap-3">
          <img src={faviconFor(link.url)} alt="" className="h-8 w-8 rounded" />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base leading-tight">{link.title || link.url}</h2>
            <a href={link.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary hover:underline break-all flex items-center gap-1 mt-1">
              {link.domain || link.url} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Pill icon={Icon} label={link.content_type} />
        <Pill label={link.status} tone={link.status === "ready" ? "primary" : link.status === "failed" ? "destructive" : "muted"} />
        {link.pinned && <Pill icon={Pin} label="pinned" tone="primary" />}
      </div>

      {link.summary && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Summary</div>
          <p className="text-sm leading-relaxed text-foreground/90">{link.summary}</p>
        </div>
      )}

      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Tags</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {link.tags.map((t) => (
            <button key={t} onClick={() => removeTag(t)} className="group font-mono text-xs px-2 py-0.5 rounded-md bg-accent text-accent-foreground hover:bg-destructive/20 hover:text-destructive">
              #{t} <span className="opacity-0 group-hover:opacity-100">×</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="Add tag" className="h-7 text-xs font-mono" />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={addTag}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-8 font-mono text-xs" onClick={() => onPin(link.id, link.pinned)}>
          <Star className={`h-3.5 w-3.5 mr-1.5 ${link.pinned ? "fill-primary text-primary" : ""}`} />
          {link.pinned ? "Unpin" : "Pin"}
        </Button>
        {link.status !== "ready" && (
          <Button size="sm" variant="outline" className="h-8 font-mono text-xs" onClick={() => onRetry(link.id)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Retry
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 font-mono text-xs text-destructive hover:bg-destructive/10" onClick={() => onDelete(link.id)}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
        </Button>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Saved</div>
        <div className="font-mono text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}
        </div>
      </div>

      {similar.length > 0 && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Similar</div>
          <div className="space-y-1.5">
            {similar.map((s) => (
              <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-border/50 px-2.5 py-1.5 hover:border-primary/40 hover:bg-accent/30 transition">
                <div className="text-xs font-medium truncate">{s.title || s.url}</div>
                <div className="font-mono text-[10px] text-muted-foreground truncate">{s.domain}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ icon: Icon, label, tone }: { icon?: typeof FileText; label: string; tone?: "primary" | "muted" | "destructive" }) {
  const cls = tone === "primary" ? "bg-primary/10 text-primary" :
              tone === "destructive" ? "bg-destructive/10 text-destructive" :
              tone === "muted" ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground";
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md ${cls}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24">
      <div className="opacity-20 animate-float">
        <Logo size={96} />
      </div>
      <h3 className="mt-6 font-mono text-base font-semibold">No links yet</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md">
        Add a link above or paste links in your Telegram channel and they'll appear here automatically.
      </p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 rounded-2xl shimmer" />
      ))}
    </div>
  );
}

function RecycleBinDialog({ open, onOpenChange, links, onRefresh }: { open: boolean; onOpenChange: (v: boolean) => void; links: LinkRow[]; onRefresh: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono">Recycle bin</DialogTitle>
          <DialogDescription>Restore links or delete them permanently.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto space-y-1.5 scrollbar-thin">
          {links.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Trash is empty.</p>}
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-xl border border-border/50 px-2 py-1.5">
              <img src={faviconFor(l.url)} alt="" className="h-4 w-4 rounded" />
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate">{l.title || l.url}</div>
                <div className="font-mono text-[10px] text-muted-foreground truncate">{l.domain}</div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={async () => { await restoreLink(l.id); onRefresh(); }}>Restore</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={async () => { await permanentlyDelete(l.id); onRefresh(); }}>Delete</Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={async () => { await emptyTrash(); onRefresh(); toast.success("Trash emptied"); onOpenChange(false); }} disabled={!links.length}>
            Empty trash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const items = [
    ["/", "Focus search"], ["?", "This dialog"], ["g", "Toggle list/grid"],
    ["↑ ↓", "Navigate links"], ["Enter", "Open selected link"], ["Esc", "Close detail"],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-mono">Keyboard shortcuts</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          {items.map(([k, l]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{l}</span>
              <kbd className="font-mono text-[11px] px-2 py-0.5 rounded-md border border-border bg-muted">{k}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (v: boolean) => void; onImport: (raw: string) => void }) {
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-mono">Import links</DialogTitle><DialogDescription>One URL per line.</DialogDescription></DialogHeader>
        <textarea value={text} onChange={(e) => setText(e.target.value)} className="w-full h-40 rounded-xl border border-border bg-background p-3 font-mono text-xs" />
        <DialogFooter>
          <Button onClick={() => { onImport(text); setText(""); onOpenChange(false); }}>Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SmartSearchDialog({ open, onOpenChange, links, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; links: LinkRow[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (!q.trim()) return links.slice(0, 8);
    const t = q.toLowerCase();
    return links.filter((l) =>
      (l.title ?? "").toLowerCase().includes(t) ||
      (l.summary ?? "").toLowerCase().includes(t) ||
      l.tags.some((x) => x.toLowerCase().includes(t))
    ).slice(0, 12);
  }, [links, q]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-mono flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Smart search</DialogTitle></DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything across your library..." className="font-mono text-sm" autoFocus />
        <div className="space-y-1 max-h-80 overflow-auto scrollbar-thin">
          {results.map((l) => (
            <button key={l.id} onClick={() => onPick(l.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-accent text-left">
              <img src={faviconFor(l.url)} alt="" className="h-4 w-4 rounded" />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{l.title || l.url}</div>
                <div className="font-mono text-[10px] text-muted-foreground truncate">{l.domain}</div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkTagDialog({ open, onOpenChange, onApply }: { open: boolean; onOpenChange: (v: boolean) => void; onApply: (tag: string) => void }) {
  const [tag, setTag] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-mono">Add tag to selected</DialogTitle></DialogHeader>
        <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="tag-name" className="font-mono text-sm" autoFocus />
        <DialogFooter><Button onClick={() => onApply(tag)} disabled={!tag.trim()}>Apply</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniPill({ label, value, destructive }: { label: string; value: number; destructive?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-md border border-border/50 px-1.5 py-1 ${destructive ? "bg-destructive/10 text-destructive" : "bg-muted/30"}`}>
      <span className="font-mono text-sm leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}
