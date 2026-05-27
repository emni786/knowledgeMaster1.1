import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Pin,
  RefreshCw,
  Trash2,
  LogOut,
  Settings,
  Sparkles,
  LayoutGrid,
  List,
  Hash,
  CheckSquare,
  Activity,
  Compass,
  Network,
  BarChart3,
  Newspaper,
  Library as LibraryIcon,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Star,
  Bell,
  BellOff,
  Eye,
  EyeOff,
  RotateCcw,
  MoreHorizontal,
  Pencil,
  Check,
  X,
  Filter,
  FileText,
  Video,
  Github,
  BookOpen,
  Wrench,
  MessagesSquare,
  HelpCircle,
  Inbox,
  Upload,
  Download,
  Tag,
  Keyboard,
  AlertCircle,
  Loader2,
  Menu,
  SlidersHorizontal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Wordmark, Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PageTabs } from "@/components/PageTabs";
import { useLocalStorage } from "@/lib/local-storage";
import {
  useLanguage,
  pickTitle,
  pickSummary,
  resolveLang,
  type Lang,
  type LangPref,
} from "@/lib/i18n";
import { useDueReminders } from "@/lib/notifications";
import { NotificationBell } from "@/components/NotificationBell";
import { SetReminderDialog } from "@/components/SetReminderDialog";
import { faviconFor, getDomain, normalizeUrl } from "@/lib/url";
import {
  fetchLinks,
  addLinks,
  updateLink,
  softDeleteLink,
  softDeleteMany,
  togglePin,
  retryAnalysis,
  restoreLink,
  restoreMany,
  permanentlyDelete,
  permanentlyDeleteMany,
  emptyTrash,
  bulkAddTag,
  setPriority,
  setRead,
  setReminder,
} from "@/lib/api/links";
import {
  fetchCollections,
  createCollection,
  deleteCollection,
  renameCollection,
} from "@/lib/api/collections";
import type { LinkRow, FilterState, ContentType, LinkStatus } from "@/lib/types";
import { DEFAULT_FILTERS } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Library — Knowledgemaster" },
      {
        name: "description",
        content:
          "Browse, search, filter, and manage your AI-tagged link library. Bulk actions, collections, and smart organization for every saved link.",
      },
      { property: "og:title", content: "Library — Knowledgemaster" },
    ],
    links: [{ rel: "canonical", href: "/library" }],
  }),
  component: LibraryPage,
});

const TYPE_ICON: Record<ContentType, typeof FileText> = {
  article: FileText,
  video: Video,
  repo: Github,
  docs: BookOpen,
  tool: Wrench,
  thread: MessagesSquare,
  other: LibraryIcon,
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  // Confirms permanent (irreversible) bulk delete from the toolbar selection.
  // Single-link permanent delete is confirmed inside the detail panel itself.
  const [bulkPermanentDeleteOpen, setBulkPermanentDeleteOpen] = useState(false);
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
    if (t === "trash")
      setFilters({
        ...filters,
        showDeleted: true,
        pinnedOnly: false,
        status: "all",
        showDuplicates: false,
      });
    else if (t === "pinned")
      setFilters({
        ...filters,
        showDeleted: false,
        pinnedOnly: true,
        status: "all",
        showDuplicates: false,
      });
    else if (t === "failed")
      setFilters({
        ...filters,
        showDeleted: false,
        pinnedOnly: false,
        status: "failed",
        showDuplicates: false,
      });
    else
      setFilters({
        ...filters,
        showDeleted: false,
        pinnedOnly: false,
        status: "all",
        showDuplicates: false,
      });
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

  // All mutations below apply their change to the in-memory cache *first*
  // and only then fire the server request. The user sees star / read /
  // delete / pin / tag toggles update instantly; if the server call fails
  // we roll back to `prev`. `onSettled` then refetches so the cache picks
  // up anything the server set (e.g. `updated_at`).
  const optimisticUpdate = (update: (links: LinkRow[]) => LinkRow[]): LinkRow[] => {
    const prev = qc.getQueryData<LinkRow[]>(["links"]) ?? [];
    qc.setQueryData<LinkRow[]>(["links"], update(prev));
    return prev;
  };

  // URLs we just added optimistically — when their realtime INSERT comes
  // through we skip the duplicate "New link added" toast (the user already
  // got an immediate "Link saved" toast from the optimistic update).
  const recentlyAddedUrlsRef = useRef<Set<string>>(new Set());

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("links-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "links" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["links"] });
        if (payload.eventType === "INSERT") {
          const url =
            (payload.new as { url?: string; normalized_url?: string } | null)?.normalized_url ??
            (payload.new as { url?: string } | null)?.url ??
            "";
          if (recentlyAddedUrlsRef.current.has(url)) {
            recentlyAddedUrlsRef.current.delete(url);
            return;
          }
          toast.success("New link added");
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
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
      article: 0,
      video: 0,
      repo: 0,
      docs: 0,
      tool: 0,
      thread: 0,
      other: 0,
    };
    active.forEach((l) => {
      byType[l.content_type] = (byType[l.content_type] ?? 0) + 1;
    });
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
    if (filters.contentType !== "all")
      list = list.filter((l) => l.content_type === filters.contentType);
    if (filters.status !== "all") list = list.filter((l) => l.status === filters.status);
    if (filters.pinnedOnly) list = list.filter((l) => l.pinned);
    if (filters.minPriority > 0)
      list = list.filter((l) => (l.priority ?? 0) >= filters.minPriority);
    if (filters.readState === "read") list = list.filter((l) => !!l.read_at);
    else if (filters.readState === "unread") list = list.filter((l) => !l.read_at);
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter(
        (l) =>
          (l.title ?? "").toLowerCase().includes(q) ||
          (l.title_bn ?? "").toLowerCase().includes(q) ||
          (l.summary ?? "").toLowerCase().includes(q) ||
          (l.summary_bn ?? "").toLowerCase().includes(q) ||
          (l.url ?? "").toLowerCase().includes(q) ||
          (l.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
          (l.key_points ?? []).some((k) => k.toLowerCase().includes(q)),
      );
    }
    if (filters.showDuplicates) {
      const seen = new Map<string, LinkRow[]>();
      list.forEach((l) => {
        const k = l.normalized_url ?? l.url;
        const arr = seen.get(k) ?? [];
        arr.push(l);
        seen.set(k, arr);
      });
      list = Array.from(seen.values())
        .filter((arr) => arr.length > 1)
        .flat();
    }
    list.sort((a, b) => {
      switch (filters.sort) {
        case "oldest":
          return a.created_at.localeCompare(b.created_at);
        case "title-asc":
          return (a.title ?? "").localeCompare(b.title ?? "");
        case "title-desc":
          return (b.title ?? "").localeCompare(a.title ?? "");
        case "domain-asc":
          return (a.domain ?? "").localeCompare(b.domain ?? "");
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });
    // pinned first
    list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return list;
  }, [allLinks, filters, debouncedQuery]);

  const groups = useMemo(
    () => ({
      ready: visible.filter((l) => l.status === "ready"),
      pending: visible.filter((l) => l.status === "pending"),
      failed: visible.filter((l) => l.status === "failed"),
    }),
    [visible],
  );

  // Render-order list of visible ids. Used for shift+click range select and
  // for the "Select all" checkbox in the bulk action bar so that the range
  // matches what the user actually sees on screen.
  const visibleOrderedIds = useMemo(
    () => [...groups.ready, ...groups.pending, ...groups.failed].map((l) => l.id),
    [groups],
  );

  const selectedLink = useMemo(
    () => allLinks.find((l) => l.id === selected) ?? null,
    [allLinks, selected],
  );

  // Mutations
  // Optimistic add: drop placeholder rows into the cache before the server
  // call even fires. The user sees the Add input clear and the new "pending"
  // cards appear instantly — no waiting on the saveLinksPending round trip
  // (which can be slow on cold-started serverless deploys). The realtime
  // INSERT push from Supabase later reconciles the optimistic rows with the
  // real ones; on error we roll back to the previous list.
  const addMut = useMutation({
    mutationFn: addLinks,
    onMutate: async (urls: string[]) => {
      await qc.cancelQueries({ queryKey: ["links"] });
      const prev = qc.getQueryData<LinkRow[]>(["links"]) ?? [];
      const nowIso = new Date().toISOString();
      const placeholders: LinkRow[] = urls.map((url, i) => {
        const norm = normalizeUrl(url);
        const domain = getDomain(norm);
        recentlyAddedUrlsRef.current.add(norm);
        return {
          id: `optimistic-${nowIso}-${i}`,
          owner_id: "",
          url,
          normalized_url: norm,
          domain,
          title: domain || url,
          title_bn: domain || url,
          summary: "Analyzing…",
          summary_bn: "Analyzing…",
          key_points: [],
          content_type: "other",
          status: "pending",
          tags: [],
          pinned: false,
          priority: 0,
          read_at: null,
          reminder_at: null,
          // Placeholder before the analyzer runs; the real value is filled in
          // once analysis completes (and we default sensibly via pickTitle).
          source_lang: "en",
          source: "manual",
          error_message: null,
          fetched_at: null,
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        };
      });
      qc.setQueryData<LinkRow[]>(["links"], [...placeholders, ...prev]);
      toast.success(
        urls.length > 1
          ? `Saved ${urls.length} links — analyzing in background`
          : "Link saved — analyzing in background",
      );
      return { prev };
    },
    onError: (e: Error, _urls, ctx) => {
      if (ctx?.prev) qc.setQueryData(["links"], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => {
      // Real rows are already in the DB; refetch so the optimistic
      // placeholders get replaced with the persisted rows (with real ids).
      qc.invalidateQueries({ queryKey: ["links"] });
    },
  });
  const deleteMut = useMutation({
    mutationFn: softDeleteLink,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["links"] });
      const nowIso = new Date().toISOString();
      const prev = optimisticUpdate((links) =>
        links.map((l) => (l.id === id ? { ...l, deleted_at: nowIso } : l)),
      );
      setSelected(null);
      toast.success("Moved to trash");
      return { prev };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["links"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["links"] }),
  });
  const permanentDeleteMut = useMutation({
    mutationFn: permanentlyDelete,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["links"] });
      const prev = optimisticUpdate((links) => links.filter((l) => l.id !== id));
      setSelected(null);
      toast.success("Deleted permanently");
      return { prev };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["links"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["links"] }),
  });
  const restoreMut = useMutation({
    mutationFn: restoreLink,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["links"] });
      const prev = optimisticUpdate((links) =>
        links.map((l) => (l.id === id ? { ...l, deleted_at: null } : l)),
      );
      toast.success("Restored");
      return { prev };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["links"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["links"] }),
  });
  const pinMut = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => togglePin(id, pinned),
    onMutate: async ({ id, pinned }) => {
      await qc.cancelQueries({ queryKey: ["links"] });
      const prev = optimisticUpdate((links) =>
        links.map((l) => (l.id === id ? { ...l, pinned } : l)),
      );
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["links"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["links"] }),
  });
  const priorityMut = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: 0 | 1 | 2 | 3 }) =>
      setPriority(id, priority),
    onMutate: async ({ id, priority }) => {
      await qc.cancelQueries({ queryKey: ["links"] });
      const prev = optimisticUpdate((links) =>
        links.map((l) => (l.id === id ? { ...l, priority } : l)),
      );
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["links"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["links"] }),
  });
  const readMut = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => setRead(id, read),
    onMutate: async ({ id, read }) => {
      await qc.cancelQueries({ queryKey: ["links"] });
      const at = read ? new Date().toISOString() : null;
      const prev = optimisticUpdate((links) =>
        links.map((l) => (l.id === id ? { ...l, read_at: at } : l)),
      );
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["links"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["links"] }),
  });
  const emptyTrashMut = useMutation({
    mutationFn: () => emptyTrash(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["links"] });
      const prev = optimisticUpdate((links) => links.filter((l) => !l.deleted_at));
      toast.success("Trash emptied");
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["links"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["links"] }),
  });
  const reminderMut = useMutation({
    mutationFn: ({ id, at }: { id: string; at: string | null }) => setReminder(id, at),
    onMutate: async ({ id, at }) => {
      await qc.cancelQueries({ queryKey: ["links"] });
      const prev = optimisticUpdate((links) =>
        links.map((l) => (l.id === id ? { ...l, reminder_at: at } : l)),
      );
      if (at) {
        toast.success(`Reminder set for ${new Date(at).toLocaleString()}`);
      } else {
        toast.success("Reminder cleared");
      }
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["links"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["links"] }),
  });

  const handleAdd = (raw: string) => {
    const urls = Array.from(
      new Set(
        raw
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter((s) => /^https?:\/\//.test(s)),
      ),
    );
    if (!urls.length) return toast.error("Enter one or more valid URLs");
    const existing = new Set(
      allLinks.flatMap((l) => [l.normalized_url, l.url].filter(Boolean) as string[]),
    );
    const seen = new Set<string>();
    const fresh: string[] = [];
    const dupes: string[] = [];
    for (const u of urls) {
      const key = normalizeUrl(u);
      if (existing.has(key) || existing.has(u) || seen.has(key)) {
        dupes.push(u);
      } else {
        seen.add(key);
        fresh.push(u);
      }
    }
    if (dupes.length) {
      toast.message(`Skipped ${dupes.length} duplicate${dupes.length === 1 ? "" : "s"}`, {
        description:
          dupes
            .slice(0, 3)
            .map((d) => getDomain(d) || d)
            .join(", ") + (dupes.length > 3 ? "…" : ""),
      });
    }
    if (!fresh.length) return;
    addMut.mutate(fresh);
  };

  const handleExport = (format: "json" | "csv" | "txt") => {
    const rows = visible;
    if (!rows.length) return toast.error("Nothing to export");
    let blob: Blob;
    let filename: string;
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      filename = `knowledgemaster-${stamp}.json`;
    } else if (format === "csv") {
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = [
        "url",
        "title",
        "domain",
        "content_type",
        "status",
        "tags",
        "pinned",
        "summary",
        "created_at",
      ];
      const lines = [header.join(",")];
      for (const l of rows) {
        lines.push(
          [
            l.url,
            l.title ?? "",
            l.domain ?? "",
            l.content_type,
            l.status,
            (l.tags ?? []).join("|"),
            l.pinned,
            l.summary ?? "",
            l.created_at,
          ]
            .map(esc)
            .join(","),
        );
      }
      blob = new Blob([lines.join("\n")], { type: "text/csv" });
      filename = `knowledgemaster-${stamp}.csv`;
    } else {
      blob = new Blob([rows.map((l) => l.url).join("\n")], { type: "text/plain" });
      filename = `knowledgemaster-${stamp}.txt`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} links as ${format.toUpperCase()}`);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const handleSelectLink = (id: string) => {
    setSelected(id);
    setDetailOpen(true);
    // Opening the detail panel implicitly marks the link as read. The user
    // can manually flip it back via the detail panel's "Mark unread" action.
    const row = allLinks.find((l) => l.id === id);
    if (row && !row.read_at && row.status === "ready" && !row.deleted_at) {
      readMut.mutate({ id, read: true });
    }
  };

  // Reminder watcher — surfaces toast + (if permitted) browser notification
  // for any due reminder, persists dismissed reminders to localStorage so
  // they don't keep re-firing across reloads, and powers the bell-icon
  // badge in the header via the returned `due` list. Mounted exactly once
  // here so multiple bell instances share the same notified set.
  const {
    due: dueReminders,
    dismiss: dismissReminder,
    dismissAll: dismissAllReminders,
  } = useDueReminders(allLinks);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === "g") {
        e.preventDefault();
        setView(view === "list" ? "grid" : "list");
      } else if (e.key === "Escape") {
        setSelected(null);
        setDetailOpen(false);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = visible.findIndex((l) => l.id === selected);
        const next =
          e.key === "ArrowDown" ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx - 1);
        if (visible[next]) setSelected(visible[next].id);
      } else if (e.key === "Enter" && selected && selectedLink) {
        window.open(selectedLink.url, "_blank");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selected, selectedLink, view, setView]);

  const lastSelectedIdRef = useRef<string | null>(null);
  const toggleSelected = useCallback(
    (id: string, opts?: { shift?: boolean; visibleIds?: string[] }) => {
      const { shift, visibleIds } = opts ?? {};
      const anchor = lastSelectedIdRef.current;
      if (shift && anchor && visibleIds && anchor !== id) {
        const a = visibleIds.indexOf(anchor);
        const b = visibleIds.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const range = visibleIds.slice(lo, hi + 1);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const rid of range) next.add(rid);
            return next;
          });
          lastSelectedIdRef.current = id;
          return;
        }
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastSelectedIdRef.current = id;
    },
    [],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background text-foreground">
        {/* Mobile header — visible below lg */}
        <MobileHeader
          email={user?.email}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          bell={
            <NotificationBell
              due={dueReminders}
              dismiss={dismissReminder}
              dismissAll={dismissAllReminders}
              onOpenLink={(id) => handleSelectLink(id)}
            />
          }
        />

        {/* Mobile sidebar drawer — only used below lg */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="p-0 w-72 max-w-[85vw] flex flex-col">
            <div className="p-4 border-b border-border/50">
              <Wordmark collapsed={false} />
              {user?.email && (
                <div className="mt-2 text-[11px] font-mono text-muted-foreground truncate">
                  {user.email}
                </div>
              )}
            </div>
            <nav className="px-2 py-3 space-y-0.5">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileSidebarOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-primary/10 hover:text-primary transition-colors font-medium text-muted-foreground"
                  activeProps={{ className: "bg-primary/10 text-primary" }}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="px-4 py-2 grid grid-cols-3 gap-1.5">
              <MiniPill label="All" value={stats.all} />
              <MiniPill
                label="Pin"
                value={allLinks.filter((l) => !l.deleted_at && l.pinned).length}
              />
              <MiniPill label="Fail" value={stats.failed} destructive={stats.failed > 0} />
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <CollectionsBlock
                collections={collectionsQuery.data ?? []}
                activeId={filters.collectionId}
                onSelect={(id) => {
                  setFilters({ ...filters, collectionId: id });
                  setMobileSidebarOpen(false);
                }}
              />
            </div>
            <div className="p-3 border-t border-border/50 flex items-center gap-1.5 flex-wrap">
              <ThemeToggle />
              <Link to="/settings" onClick={() => setMobileSidebarOpen(false)}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:bg-destructive/10 ml-auto"
                onClick={() => {
                  setMobileSidebarOpen(false);
                  setSignOutConfirmOpen(true);
                }}
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <div
          className={`lg:grid ${collapsed ? "lg:grid-cols-[64px_1fr]" : "lg:grid-cols-[280px_1fr]"} min-h-screen lg:transition-[grid-template-columns] lg:duration-300 lg:ease-in-out motion-reduce:transition-none`}
        >
          {/* Desktop sidebar — hidden below lg, drawer covers that case */}
          <aside className="hidden lg:flex border-r border-border/50 bg-sidebar text-sidebar-foreground flex-col h-screen sticky top-0">
            <div
              className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} p-3 border-b border-border/50 min-h-[57px]`}
            >
              {!collapsed && <Wordmark collapsed={false} />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCollapsed(!collapsed)}
                  >
                    {collapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{collapsed ? "Expand" : "Collapse"}</TooltipContent>
              </Tooltip>
            </div>
            {!collapsed && user?.email && (
              <div className="px-4 py-2 text-[11px] font-mono text-muted-foreground truncate border-b border-border/50">
                {user.email}
              </div>
            )}
            <nav className="px-2 py-3 space-y-0.5">
              {NAV.map((item) => {
                const link = (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} rounded-xl py-2 text-sm hover:bg-primary/10 hover:text-primary transition-colors font-medium`}
                    activeProps={{ className: "bg-primary/10 text-primary" }}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
                return collapsed ? (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </nav>

            {!collapsed && (
              <div className="px-4 py-3 border-t border-border/50 grid grid-cols-3 gap-1.5">
                <MiniPill label="All" value={stats.all} />
                <MiniPill
                  label="Pin"
                  value={allLinks.filter((l) => !l.deleted_at && l.pinned).length}
                />
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

            <div
              className={`mt-auto p-3 border-t border-border/50 ${collapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-1"}`}
            >
              <NotificationBell
                due={dueReminders}
                dismiss={dismissReminder}
                dismissAll={dismissAllReminders}
                onOpenLink={(id) => handleSelectLink(id)}
                variant="sidebar"
              />
              <ThemeToggle />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                    onClick={() => setShortcutsOpen(true)}
                  >
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Shortcuts (?)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link to="/settings">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-9 w-9 hover:bg-destructive/10 hover:text-destructive ${collapsed ? "" : "ml-auto"}`}
                    onClick={() => setSignOutConfirmOpen(true)}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
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
              addPending={false}
              onSmartSearch={() => setSmartOpen(true)}
              onImport={() => setImportOpen(true)}
              onExport={handleExport}
              onRefresh={() => linksQuery.refetch()}
              onOpenFilters={() => setFiltersOpen(true)}
            />

            <div className="bg-background border-b border-border/50 px-4 sm:px-6 overflow-x-auto scrollbar-thin">
              <PageTabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: "all", label: "All", icon: Inbox, badge: stats.all },
                  {
                    id: "pinned",
                    label: "Pinned",
                    icon: Pin,
                    badge: allLinks.filter((l) => !l.deleted_at && l.pinned).length,
                  },
                  { id: "failed", label: "Failed", icon: AlertCircle, badge: stats.failed },
                  { id: "trash", label: "Trash", icon: Trash2, badge: stats.deleted },
                ]}
              />
            </div>
            {selectMode &&
              (() => {
                const visibleCount = visibleOrderedIds.length;
                const selectedVisibleCount = visibleOrderedIds.reduce(
                  (n, id) => (selectedIds.has(id) ? n + 1 : n),
                  0,
                );
                const allSelected = visibleCount > 0 && selectedVisibleCount === visibleCount;
                const partiallySelected =
                  selectedVisibleCount > 0 && selectedVisibleCount < visibleCount;
                const toggleSelectAll = () => {
                  if (allSelected) setSelectedIds(new Set());
                  else setSelectedIds(new Set(visibleOrderedIds));
                };
                const inTrash = tab === "trash";
                const hasSelection = selectedIds.size > 0;
                return (
                  <div className="sticky top-0 z-20 px-4 sm:px-6 py-2 bg-primary/10 border-b border-primary/20 flex items-center gap-2 animate-fade-in flex-wrap">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      disabled={visibleCount === 0}
                      className="inline-flex items-center gap-2 font-mono text-xs h-7 px-2 rounded-md hover:bg-primary/15 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Checkbox
                        checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                        className="pointer-events-none"
                      />
                      <span>
                        {allSelected
                          ? `All ${visibleCount} selected`
                          : selectedIds.size > 0
                            ? `${selectedIds.size} selected`
                            : `Select all (${visibleCount})`}
                      </span>
                    </button>

                    {inTrash ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 font-mono text-xs"
                          disabled={!hasSelection}
                          onClick={() => {
                            const ids = Array.from(selectedIds);
                            const idSet = new Set(ids);
                            const prev = optimisticUpdate((links) =>
                              links.map((l) => (idSet.has(l.id) ? { ...l, deleted_at: null } : l)),
                            );
                            toast.success(
                              `Restored ${ids.length} link${ids.length === 1 ? "" : "s"}`,
                            );
                            setSelectedIds(new Set());
                            setSelectMode(false);
                            restoreMany(ids)
                              .then(() => qc.invalidateQueries({ queryKey: ["links"] }))
                              .catch((e: Error) => {
                                qc.setQueryData(["links"], prev);
                                toast.error(e.message);
                              });
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 font-mono text-xs text-destructive"
                          disabled={!hasSelection}
                          onClick={() => setBulkPermanentDeleteOpen(true)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete forever
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 font-mono text-xs"
                          disabled={!hasSelection}
                          onClick={() => setBulkTagOpen(true)}
                        >
                          <Tag className="h-3 w-3 mr-1" />
                          Add tag
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 font-mono text-xs text-destructive"
                          disabled={!hasSelection}
                          onClick={() => {
                            const ids = Array.from(selectedIds);
                            const idSet = new Set(ids);
                            const nowIso = new Date().toISOString();
                            const prev = optimisticUpdate((links) =>
                              links.map((l) =>
                                idSet.has(l.id) ? { ...l, deleted_at: nowIso } : l,
                              ),
                            );
                            toast.success(
                              `Moved ${ids.length} link${ids.length === 1 ? "" : "s"} to trash`,
                            );
                            setSelectedIds(new Set());
                            setSelectMode(false);
                            softDeleteMany(ids)
                              .then(() => qc.invalidateQueries({ queryKey: ["links"] }))
                              .catch((e: Error) => {
                                qc.setQueryData(["links"], prev);
                                toast.error(e.message);
                              });
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 font-mono text-xs ml-auto"
                      onClick={() => {
                        setSelectedIds(new Set());
                        setSelectMode(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                );
              })()}

            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-4">
              {linksQuery.isLoading ? (
                <SkeletonList />
              ) : visible.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-6">
                  {groups.ready.length > 0 && (
                    <Section title="Ready" count={groups.ready.length} icon={Sparkles}>
                      <LinkGrid
                        links={groups.ready}
                        view={view}
                        showNumbers={showNumbers}
                        numberOffset={0}
                        selectMode={selectMode}
                        selectedIds={selectedIds}
                        toggleSelected={toggleSelected}
                        visibleOrderedIds={visibleOrderedIds}
                        selected={selected}
                        onSelect={handleSelectLink}
                        onPin={(id, p) => pinMut.mutate({ id, pinned: !p })}
                      />
                    </Section>
                  )}
                  {groups.pending.length > 0 && (
                    <Section
                      title="Pending"
                      count={groups.pending.length}
                      icon={Loader2}
                      iconClass="animate-spin"
                    >
                      <LinkGrid
                        links={groups.pending}
                        view={view}
                        showNumbers={showNumbers}
                        numberOffset={groups.ready.length}
                        selectMode={selectMode}
                        selectedIds={selectedIds}
                        toggleSelected={toggleSelected}
                        visibleOrderedIds={visibleOrderedIds}
                        selected={selected}
                        onSelect={handleSelectLink}
                        onPin={(id, p) => pinMut.mutate({ id, pinned: !p })}
                      />
                    </Section>
                  )}
                  {groups.failed.length > 0 && (
                    <Section
                      title="Failed"
                      count={groups.failed.length}
                      icon={AlertCircle}
                      iconClass="text-destructive"
                    >
                      <LinkGrid
                        links={groups.failed}
                        view={view}
                        showNumbers={showNumbers}
                        numberOffset={groups.ready.length + groups.pending.length}
                        selectMode={selectMode}
                        selectedIds={selectedIds}
                        toggleSelected={toggleSelected}
                        visibleOrderedIds={visibleOrderedIds}
                        selected={selected}
                        onSelect={handleSelectLink}
                        onPin={(id, p) => pinMut.mutate({ id, pinned: !p })}
                      />
                    </Section>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Detail panel — sheet on all viewports (full-width on mobile, side panel on lg+) */}
        <Sheet
          open={detailOpen && !!selectedLink}
          onOpenChange={(o) => {
            setDetailOpen(o);
            if (!o) setSelected(null);
          }}
        >
          <SheetContent side="right" className="w-full sm:max-w-md lg:max-w-lg p-0 overflow-y-auto">
            {selectedLink && (
              <DetailPanel
                link={selectedLink}
                isTrashed={!!selectedLink.deleted_at}
                onDelete={(id) => {
                  if (selectedLink.deleted_at) {
                    permanentDeleteMut.mutate(id);
                  } else {
                    deleteMut.mutate(id);
                  }
                  setDetailOpen(false);
                }}
                onRestore={(id) => {
                  restoreMut.mutate(id);
                  setDetailOpen(false);
                  setSelected(null);
                }}
                onPin={(id, p) => pinMut.mutate({ id, pinned: !p })}
                onRetry={(id) => {
                  const prev = optimisticUpdate((links) =>
                    links.map((l) =>
                      l.id === id
                        ? {
                            ...l,
                            status: "pending",
                            summary: "Analyzing\u2026",
                            summary_bn: "Analyzing\u2026",
                            error_message: null,
                          }
                        : l,
                    ),
                  );
                  retryAnalysis(id)
                    .then(() => qc.invalidateQueries({ queryKey: ["links"] }))
                    .catch((e: Error) => {
                      qc.setQueryData(["links"], prev);
                      toast.error(e.message);
                    });
                }}
                onUpdate={(id, patch) => {
                  const prev = optimisticUpdate((links) =>
                    links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
                  );
                  return updateLink(id, patch)
                    .then(() => {
                      qc.invalidateQueries({ queryKey: ["links"] });
                    })
                    .catch((e: Error) => {
                      qc.setQueryData(["links"], prev);
                      toast.error(e.message);
                      throw e;
                    });
                }}
                onSetPriority={(id, p) => priorityMut.mutate({ id, priority: p })}
                onSetRead={(id, r) => readMut.mutate({ id, read: r })}
                onSetReminder={(id, at) => reminderMut.mutate({ id, at })}
                allLinks={allLinks}
              />
            )}
          </SheetContent>
        </Sheet>

        {/* Filters sheet — opens from right on all viewports */}
        <FiltersSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          filters={filters}
          setFilters={setFilters}
          stats={stats}
        />

        <RecycleBinDialog
          open={recycleOpen}
          onOpenChange={setRecycleOpen}
          links={allLinks.filter((l) => l.deleted_at)}
          onRestore={(id) => restoreMut.mutate(id)}
          onPermanentDelete={(id) => permanentDeleteMut.mutate(id)}
          onEmptyTrash={() => emptyTrashMut.mutate()}
        />
        <AlertDialog open={signOutConfirmOpen} onOpenChange={setSignOutConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-mono">Sign out?</AlertDialogTitle>
              <AlertDialogDescription>
                You&apos;ll be returned to the sign-in page. Anything you have not saved yet (a URL
                you were about to paste, an unsubmitted form) will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setSignOutConfirmOpen(false);
                  handleSignOut();
                }}
              >
                Sign out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={bulkPermanentDeleteOpen} onOpenChange={setBulkPermanentDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-mono">
                Delete {selectedIds.size} link{selectedIds.size === 1 ? "" : "s"} forever?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the selected link
                {selectedIds.size === 1 ? "" : "s"} from your library. This action cannot be undone
                &mdash; they will not appear in the Recycle Bin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  const idSet = new Set(ids);
                  const prev = optimisticUpdate((links) => links.filter((l) => !idSet.has(l.id)));
                  toast.success(`Deleted ${ids.length} link${ids.length === 1 ? "" : "s"} forever`);
                  setSelectedIds(new Set());
                  setSelectMode(false);
                  setBulkPermanentDeleteOpen(false);
                  permanentlyDeleteMany(ids)
                    .then(() => qc.invalidateQueries({ queryKey: ["links"] }))
                    .catch((e: Error) => {
                      qc.setQueryData(["links"], prev);
                      toast.error(e.message);
                    });
                }}
              >
                Delete forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleAdd} />
        <SmartSearchDialog
          open={smartOpen}
          onOpenChange={setSmartOpen}
          links={allLinks}
          onPick={(id) => {
            setSelected(id);
            setSmartOpen(false);
          }}
        />
        <BulkTagDialog
          open={bulkTagOpen}
          onOpenChange={setBulkTagOpen}
          onApply={(tag) => {
            const ids = Array.from(selectedIds);
            const idSet = new Set(ids);
            const prev = optimisticUpdate((links) =>
              links.map((l) =>
                idSet.has(l.id) && !l.tags.includes(tag) ? { ...l, tags: [...l.tags, tag] } : l,
              ),
            );
            toast.success(`Added "${tag}" to ${ids.length} link${ids.length === 1 ? "" : "s"}`);
            setBulkTagOpen(false);
            setSelectMode(false);
            setSelectedIds(new Set());
            bulkAddTag(ids, tag)
              .then(() => qc.invalidateQueries({ queryKey: ["links"] }))
              .catch((e: Error) => {
                qc.setQueryData(["links"], prev);
                toast.error(e.message);
              });
          }}
        />
      </div>
    </TooltipProvider>
  );
}

function MobileHeader({
  email,
  onOpenSidebar,
  bell,
}: {
  email?: string;
  onOpenSidebar: () => void;
  // Slot for the notification bell so the LibraryPage can wire it to the
  // shared reminder watcher without leaking that wiring into the header.
  bell?: React.ReactNode;
}) {
  return (
    <header className="lg:hidden glass sticky top-0 z-30 border-b border-border/50 px-3 flex items-center gap-2 h-14">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 -ml-1"
        onClick={onOpenSidebar}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </Button>
      <Logo />
      <div className="flex flex-col leading-tight min-w-0 flex-1">
        <span className="font-mono text-sm font-semibold truncate">Knowledgemaster</span>
        {email && (
          <span className="text-[10px] text-muted-foreground truncate hidden sm:block">
            {email}
          </span>
        )}
      </div>
      {bell}
      <LanguageToggle variant="icon" />
      <ThemeToggle />
    </header>
  );
}

const CenterToolbar = (() => {
  const Inner = (
    {
      filters,
      setFilters,
      view,
      setView,
      showNumbers,
      setShowNumbers,
      selectMode,
      setSelectMode,
      onAdd,
      addPending,
      onSmartSearch,
      onImport,
      onExport,
      onRefresh,
      onOpenFilters,
    }: {
      filters: FilterState;
      setFilters: (f: FilterState) => void;
      view: "list" | "grid";
      setView: (v: "list" | "grid") => void;
      showNumbers: boolean;
      setShowNumbers: (v: boolean) => void;
      selectMode: boolean;
      setSelectMode: (v: boolean) => void;
      onAdd: (raw: string) => void;
      addPending: boolean;
      onSmartSearch: () => void;
      onImport: () => void;
      onExport: (format: "json" | "csv" | "txt") => void;
      onRefresh: () => void;
      onOpenFilters: () => void;
    },
    ref: React.Ref<HTMLInputElement>,
  ) => {
    return (
      <div className="glass lg:sticky lg:top-0 z-20 border-b border-border/50 px-4 sm:px-6 py-3 space-y-3">
        <AddLinkInput onAdd={onAdd} loading={addPending} />
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 sm:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={ref}
              placeholder="Search links... (press /)"
              className="h-9 pl-9 font-mono text-sm bg-background/60"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-1 sm:ml-auto flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setView("list")}
                  aria-label="List view"
                >
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>List view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={view === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setView("grid")}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Grid view (g)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={selectMode ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setSelectMode(!selectMode)}
                  aria-label="Select mode"
                >
                  <CheckSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Select mode</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                  onClick={onSmartSearch}
                  aria-label="Smart search"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Smart search</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                  onClick={onOpenFilters}
                  aria-label="Filters"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filters</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                  onClick={onRefresh}
                  aria-label="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>

            {/* Secondary toolbar — hidden below md, visible inline on md+ */}
            <div className="hidden md:flex md:items-center md:gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showNumbers ? "secondary" : "ghost"}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setShowNumbers(!showNumbers)}
                    aria-label="Toggle numbers"
                  >
                    <Hash className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle numbers</TooltipContent>
              </Tooltip>
              <Link to="/discover">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                      aria-label="Discover"
                    >
                      <Compass className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Discover</TooltipContent>
                </Tooltip>
              </Link>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                    onClick={() => toast.success("All links healthy")}
                    aria-label="Link health"
                  >
                    <Activity className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Link health</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                    onClick={onImport}
                    aria-label="Import"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Import</TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 hover:bg-primary/10 hover:text-primary"
                        aria-label="Export"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Export</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="font-mono text-xs">
                  <DropdownMenuItem onClick={() => onExport("json")}>
                    Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport("csv")}>Export as CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport("txt")}>
                    Export as TXT (URLs)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="w-px h-5 bg-border mx-1" />
              <LanguageToggle />
            </div>

            {/* Overflow menu — visible only below md */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 md:hidden hover:bg-primary/10 hover:text-primary"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="font-mono text-xs w-48">
                <DropdownMenuItem onClick={() => setShowNumbers(!showNumbers)}>
                  <Hash className="h-3.5 w-3.5 mr-2" />
                  {showNumbers ? "Hide numbers" : "Show numbers"}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/discover">
                    <Compass className="h-3.5 w-3.5 mr-2" />
                    Discover
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success("All links healthy")}>
                  <Activity className="h-3.5 w-3.5 mr-2" />
                  Link health
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onImport}>
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport("json")}>
                  <Download className="h-3.5 w-3.5 mr-2" />
                  Export JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport("csv")}>
                  <Download className="h-3.5 w-3.5 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport("txt")}>
                  <Download className="h-3.5 w-3.5 mr-2" />
                  Export TXT
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  };
  return Object.assign(
    // eslint-disable-next-line react/display-name
    (props: Parameters<typeof Inner>[0] & { ref?: React.Ref<HTMLInputElement> }) =>
      Inner(props, props.ref ?? null),
    { displayName: "CenterToolbar" },
  );
})() as unknown as React.ForwardRefExoticComponent<
  {
    filters: FilterState;
    setFilters: (f: FilterState) => void;
    view: "list" | "grid";
    setView: (v: "list" | "grid") => void;
    showNumbers: boolean;
    setShowNumbers: (v: boolean) => void;
    selectMode: boolean;
    setSelectMode: (v: boolean) => void;
    onAdd: (raw: string) => void;
    addPending: boolean;
    onSmartSearch: () => void;
    onImport: () => void;
    onExport: (format: "json" | "csv" | "txt") => void;
    onRefresh: () => void;
    onOpenFilters: () => void;
  } & React.RefAttributes<HTMLInputElement>
>;

function AddLinkInput({ onAdd, loading }: { onAdd: (raw: string) => void; loading: boolean }) {
  const [val, setVal] = useState("");
  const detected = useMemo(
    () =>
      Array.from(
        new Set(
          val
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter((s) => /^https?:\/\//.test(s)),
        ),
      ),
    [val],
  );
  const isMulti = val.includes("\n") || detected.length > 1;
  const submit = () => {
    if (val.trim()) {
      onAdd(val);
      setVal("");
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-start gap-2 rounded-2xl border border-border/50 bg-card px-3 py-1.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition"
    >
      <Plus className="h-4 w-4 text-primary shrink-0 mt-1.5" />
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
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
          <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
            {detected.length} URLs
          </span>
        )}
        <Button
          type="submit"
          size="sm"
          className="h-7 font-mono text-[11px]"
          disabled={loading || !detected.length}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : detected.length > 1 ? (
            `Add ${detected.length}`
          ) : (
            "Add"
          )}
        </Button>
      </div>
    </form>
  );
}

function CollectionsBlock({
  collections,
  activeId,
  onSelect,
}: {
  collections: { id: string; name: string }[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  // Track which row is currently being inline-renamed; null when not editing.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  // Drives the confirm-delete AlertDialog. Stores the {id, name} of the
  // collection awaiting confirmation so the dialog can show its name.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const list = collections;

  const submitRename = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      // Empty name: treat as cancel rather than error so users can bail out
      // by clearing the input.
      setEditingId(null);
      setEditingName("");
      return;
    }
    const original = list.find((c) => c.id === editingId);
    if (!original || original.name === trimmed) {
      setEditingId(null);
      setEditingName("");
      return;
    }
    setEditingId(null);
    setEditingName("");
    try {
      await renameCollection(original.id, trimmed);
      qc.invalidateQueries({ queryKey: ["collections-list"] });
      toast.success(`Renamed to "${trimmed}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename collection");
    }
  };

  return (
    <div className="px-4 py-3 border-t border-border/50">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        Collections
      </div>
      <div className="space-y-0.5 max-h-40 overflow-auto scrollbar-thin">
        <button
          onClick={() => onSelect(null)}
          className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono hover:bg-primary/10 hover:text-primary ${activeId === null ? "bg-primary/10 text-primary" : ""}`}
        >
          # All links
        </button>
        {list.map((c) => {
          const isActive = activeId === c.id;
          const isEditing = editingId === c.id;
          if (isEditing) {
            return (
              <div key={c.id} className="flex items-center gap-1 px-1 py-1 rounded-lg bg-primary/5">
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submitRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingId(null);
                      setEditingName("");
                    }
                  }}
                  className="h-7 text-xs font-mono flex-1"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                  onClick={() => void submitRename()}
                  aria-label="Save name"
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setEditingId(null);
                    setEditingName("");
                  }}
                  aria-label="Cancel rename"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          }
          return (
            <div
              key={c.id}
              className={`group flex items-center rounded-lg hover:bg-primary/10 ${isActive ? "bg-primary/10" : ""}`}
            >
              <button
                onClick={() => onSelect(c.id)}
                className={`flex-1 min-w-0 text-left px-2 py-1.5 text-xs font-mono truncate hover:text-primary ${isActive ? "text-primary" : ""}`}
              >
                # {c.name}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-60 hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 lg:data-[state=open]:opacity-100 mr-1 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition"
                    aria-label={`More actions for ${c.name}`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="font-mono text-xs">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setEditingId(c.id);
                      setEditingName(c.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      setPendingDelete({ id: c.id, name: c.name });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New collection"
          className="h-7 text-xs font-mono"
        />
        <Button type="submit" size="icon" variant="ghost" className="h-7 w-7">
          <Plus className="h-3 w-3" />
        </Button>
      </form>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">
              Delete collection{pendingDelete ? ` "${pendingDelete.name}"` : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the collection itself. The links inside it stay in your library &mdash;
              only their membership in this collection is cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingDelete) return;
                const { id, name: deletedName } = pendingDelete;
                setPendingDelete(null);
                // If the deleted collection was the active filter, fall back
                // to "All links" so we don't end up on an empty view.
                if (activeId === id) onSelect(null);
                try {
                  await deleteCollection(id);
                  qc.invalidateQueries({ queryKey: ["collections-list"] });
                  toast.success(`Deleted "${deletedName}"`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to delete collection");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({
  title,
  count,
  icon: Icon,
  iconClass,
  children,
}: {
  title: string;
  count: number;
  icon: typeof FileText;
  iconClass?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="animate-fade-in">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 mb-2 group">
        <Icon className={`h-3.5 w-3.5 text-primary ${iconClass ?? ""}`} />
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground group-hover:text-primary">
          {title}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground/70">({count})</span>
      </button>
      {open && children}
    </section>
  );
}

function LinkGrid({
  links,
  view,
  showNumbers,
  numberOffset,
  selectMode,
  selectedIds,
  toggleSelected,
  visibleOrderedIds,
  selected,
  onSelect,
  onPin,
}: {
  links: LinkRow[];
  view: "list" | "grid";
  showNumbers: boolean;
  numberOffset: number;
  selectMode: boolean;
  selectedIds: Set<string>;
  toggleSelected: (id: string, opts?: { shift?: boolean; visibleIds?: string[] }) => void;
  visibleOrderedIds: string[];
  selected: string | null;
  onSelect: (id: string) => void;
  onPin: (id: string, p: boolean) => void;
}) {
  return (
    <div
      className={
        view === "grid" ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" : "space-y-1.5"
      }
    >
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
          onCheck={(shift) => toggleSelected(l.id, { shift, visibleIds: visibleOrderedIds })}
        />
      ))}
    </div>
  );
}

function LinkCard({
  link,
  index,
  view,
  showNumbers,
  selected,
  onSelect,
  onPin,
  selectMode,
  isChecked,
  onCheck,
}: {
  link: LinkRow;
  index: number;
  view: "list" | "grid";
  showNumbers: boolean;
  selected: boolean;
  onSelect: () => void;
  onPin: (p: boolean) => void;
  selectMode: boolean;
  isChecked: boolean;
  onCheck: (shift: boolean) => void;
}) {
  const { lang } = useLanguage();
  const domain = link.domain || getDomain(link.url);
  const displayTitle = pickTitle(link, lang) || link.url;
  const displaySummary = pickSummary(link, lang);
  const ago = link.created_at
    ? formatDistanceToNow(new Date(link.created_at), { addSuffix: true })
    : "";
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected]);

  // Hover preview is disabled in bulk-select mode so the trigger area stays
  // dedicated to checkbox toggling.
  const withHover = (trigger: React.ReactNode) =>
    selectMode ? (
      trigger
    ) : (
      <HoverCard openDelay={250} closeDelay={120}>
        <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
        <HoverCardContent
          align="start"
          side="right"
          sideOffset={10}
          // Keep the popup off the viewport edges and let Radix flip it to
          // the left / above if there's no room (e.g. detail panel open or
          // a wide LinkPreviewCard pushes us off-screen). The max-h + scroll
          // covers tall previews so they don't get clipped vertically.
          collisionPadding={16}
          avoidCollisions
          className="w-[22rem] max-w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-thin p-4 z-50"
        >
          <LinkPreviewCard link={link} lang={lang} />
        </HoverCardContent>
      </HoverCard>
    );

  if (view === "grid") {
    return withHover(
      <button
        ref={ref as React.RefObject<HTMLButtonElement>}
        onClick={(e) => (selectMode ? onCheck(e.shiftKey) : onSelect())}
        aria-pressed={selected}
        data-selected={selected ? "true" : undefined}
        className={`group relative overflow-hidden text-left rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selected ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-md -translate-y-0.5" : "border-border/50 bg-card"}`}
      >
        <div className="flex items-start gap-2 mb-2">
          {selectMode && <Checkbox checked={isChecked} className="mt-1" />}
          <img
            src={faviconFor(link.url)}
            alt=""
            className="h-5 w-5 rounded mt-0.5"
            loading="lazy"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {showNumbers && (
                <span className="font-mono text-[10px] text-muted-foreground">{index}.</span>
              )}
              <span className="font-mono text-[10px] text-muted-foreground truncate">{domain}</span>
              {link.pinned && <Pin className="h-3 w-3 text-primary fill-primary" />}
              {!link.read_at && link.status === "ready" && (
                <span
                  aria-label="Unread"
                  title="Unread"
                  className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"
                />
              )}
              {(link.priority ?? 0) > 0 && (
                <span
                  aria-label={`${link.priority} star${link.priority === 1 ? "" : "s"}`}
                  className="inline-flex items-center text-amber-500"
                >
                  {Array.from({ length: link.priority ?? 0 }).map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-current" />
                  ))}
                </span>
              )}
            </div>
            <h3 className="font-medium text-sm truncate mt-0.5">{displayTitle}</h3>
          </div>
          <TypeIcon type={link.content_type} className="h-4 w-4 text-primary/70" />
        </div>
        {displaySummary && (
          <p className="text-xs text-muted-foreground line-clamp-2">{displaySummary}</p>
        )}
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
              <span
                key={t}
                className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground"
              >
                #{t}
              </span>
            ))
          )}
          <span className="font-mono text-[10px] text-muted-foreground/60 ml-auto">{ago}</span>
        </div>
        {link.status === "pending" && <AnalysisProgressBar />}
      </button>,
    );
  }

  return withHover(
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      onClick={(e) => (selectMode ? onCheck(e.shiftKey) : onSelect())}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      data-selected={selected ? "true" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (selectMode) onCheck(e.shiftKey);
          else onSelect();
        }
      }}
      className={`group relative overflow-hidden flex items-center gap-3 rounded-2xl border px-3 py-2 cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selected ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-sm pl-4 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-primary" : "border-border/50 bg-card hover:bg-accent/40"}`}
    >
      {selectMode && <Checkbox checked={isChecked} />}
      {showNumbers && (
        <span className="font-mono text-[10px] text-muted-foreground w-6 text-right">{index}.</span>
      )}
      <img src={faviconFor(link.url)} alt="" className="h-5 w-5 rounded" loading="lazy" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {!link.read_at && link.status === "ready" && (
            <span
              aria-label="Unread"
              title="Unread"
              className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"
            />
          )}
          <h3 className="font-medium text-sm truncate">{displayTitle}</h3>
          {(link.priority ?? 0) > 0 && (
            <span
              aria-label={`${link.priority} star${link.priority === 1 ? "" : "s"}`}
              className="inline-flex items-center text-amber-500 shrink-0"
            >
              {Array.from({ length: link.priority ?? 0 }).map((_, i) => (
                <Star key={i} className="h-3 w-3 fill-current" />
              ))}
            </span>
          )}
          {link.pinned && <Pin className="h-3 w-3 text-primary fill-primary shrink-0" />}
          {link.status === "pending" && (
            <Loader2 className="h-3 w-3 text-muted-foreground animate-spin shrink-0" />
          )}
          {link.status === "failed" && (
            <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[10px] text-muted-foreground truncate">{domain}</span>
          {link.status === "pending" ? (
            <span className="font-mono text-[10px] text-muted-foreground">Analyzing…</span>
          ) : link.status === "failed" ? (
            <span className="font-mono text-[10px] text-destructive">Analysis failed</span>
          ) : (
            link.tags.slice(0, 4).map((t) => (
              <span key={t} className="font-mono text-[10px] text-primary/80">
                #{t}
              </span>
            ))
          )}
        </div>
        {displaySummary && link.status === "ready" && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{displaySummary}</p>
        )}
      </div>
      <TypeIcon type={link.content_type} className="h-4 w-4 text-primary/70" />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPin(link.pinned);
        }}
        className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-primary"
      >
        <Pin className={`h-3.5 w-3.5 ${link.pinned ? "fill-primary text-primary" : ""}`} />
      </button>
      <span className="font-mono text-[10px] text-muted-foreground/60 hidden md:block">{ago}</span>
      {link.status === "pending" && <AnalysisProgressBar />}
    </div>,
  );
}

function LinkPreviewCard({ link, lang }: { link: LinkRow; lang: LangPref }) {
  const title = pickTitle(link, lang);
  const summary = pickSummary(link, lang);
  const domain = link.domain || getDomain(link.url);
  const ago = link.created_at
    ? formatDistanceToNow(new Date(link.created_at), { addSuffix: true })
    : "";
  const Icon = TYPE_ICON[link.content_type];
  const hasKeyPoints = Array.isArray(link.key_points) && link.key_points.length > 0;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-2.5">
        <img
          src={faviconFor(link.url)}
          alt=""
          className="h-7 w-7 rounded mt-0.5 shrink-0"
          loading="lazy"
        />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold leading-snug text-foreground line-clamp-3">{title}</h4>
          <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-muted-foreground">
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate">{domain}</span>
            {ago && (
              <>
                <span>•</span>
                <span className="shrink-0">{ago}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {link.status === "pending" ? (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
        </p>
      ) : link.status === "failed" ? (
        <p className="text-xs text-destructive inline-flex items-start gap-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="line-clamp-3">{link.error_message ?? "Analysis failed"}</span>
        </p>
      ) : (
        <>
          {summary && (
            <p className="text-xs leading-relaxed text-foreground/90 line-clamp-[8]">{summary}</p>
          )}
          {hasKeyPoints && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                Key points
              </div>
              <ul className="space-y-1 text-xs">
                {link.key_points.slice(0, 5).map((kp, idx) => (
                  <li key={idx} className="flex gap-1.5 items-start">
                    <span className="text-primary mt-0.5 shrink-0">▸</span>
                    <span className="text-foreground/85">{kp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {link.tags && link.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {link.tags.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition shadow-sm"
      >
        <ExternalLink className="h-3 w-3" />
        Open link
      </a>
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

// Big social/platform domains where "same domain" alone is a weak similarity
// signal (everything on facebook.com / x.com is "facebook.com"). For these
// hosts we require tag overlap; for niche domains a domain match still helps.
const BROAD_DOMAINS = new Set([
  "facebook.com",
  "m.facebook.com",
  "fb.com",
  "fb.watch",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "instagram.com",
  "tiktok.com",
  "linkedin.com",
  "reddit.com",
  "threads.net",
  "medium.com",
  "substack.com",
  "github.com",
]);

function StarReadReminderRow({
  link,
  onSetPriority,
  onSetRead,
  onSetReminder,
}: {
  link: LinkRow;
  onSetPriority: (id: string, p: 0 | 1 | 2 | 3) => void;
  onSetRead: (id: string, read: boolean) => void;
  onSetReminder: (id: string, at: string | null) => void;
}) {
  // Reminder picker lives in a dedicated dialog so the controls (presets,
  // datetime input, clear) get room to breathe and don't fight the detail
  // panel's narrow column on mobile.
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);

  const priority = (link.priority ?? 0) as 0 | 1 | 2 | 3;
  const isRead = !!link.read_at;
  const hasReminder = !!link.reminder_at;
  const reminderLabel = link.reminder_at
    ? new Date(link.reminder_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const reminderTitle = link.title || link.title_bn || link.domain || link.url;

  return (
    <div className="space-y-2 rounded-lg border border-border/50 bg-card/50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Importance">
          {[1, 2, 3].map((n) => {
            const active = priority >= n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={priority === n}
                title={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => onSetPriority(link.id, priority === n ? 0 : (n as 1 | 2 | 3))}
                className={`p-1 rounded-md transition ${active ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}`}
              >
                <Star className={`h-4 w-4 ${active ? "fill-current" : ""}`} />
              </button>
            );
          })}
          {priority > 0 && (
            <button
              type="button"
              onClick={() => onSetPriority(link.id, 0)}
              className="ml-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
            >
              clear
            </button>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7 font-mono text-xs"
          onClick={() => onSetRead(link.id, !isRead)}
          title={isRead ? "Mark as unread" : "Mark as read"}
        >
          {isRead ? (
            <>
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Read
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5 mr-1.5" /> Unread
            </>
          )}
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-7 font-mono text-xs"
          title={reminderLabel ? `Reminder: ${reminderLabel}` : "Set a reminder"}
          onClick={() => setReminderDialogOpen(true)}
        >
          {hasReminder ? (
            <>
              <Bell className="h-3.5 w-3.5 mr-1.5 text-primary" />
              <span className="truncate max-w-[160px]">{reminderLabel}</span>
            </>
          ) : (
            <>
              <Bell className="h-3.5 w-3.5 mr-1.5" /> Remind me
            </>
          )}
        </Button>
        {hasReminder && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 font-mono text-xs text-destructive hover:bg-destructive/10"
            onClick={() => onSetReminder(link.id, null)}
            title="Clear reminder"
          >
            <BellOff className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <SetReminderDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        linkLabel={reminderTitle}
        currentAt={link.reminder_at ?? null}
        onSave={(at) => onSetReminder(link.id, at)}
      />
    </div>
  );
}

function DetailPanel({
  link,
  isTrashed,
  onDelete,
  onRestore,
  onPin,
  onRetry,
  onUpdate,
  onSetPriority,
  onSetRead,
  onSetReminder,
  allLinks,
}: {
  link: LinkRow;
  isTrashed?: boolean;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  onPin: (id: string, p: boolean) => void;
  onRetry: (id: string) => void;
  onUpdate: (id: string, patch: Partial<LinkRow>) => Promise<void>;
  onSetPriority: (id: string, p: 0 | 1 | 2 | 3) => void;
  onSetRead: (id: string, read: boolean) => void;
  onSetReminder: (id: string, at: string | null) => void;
  allLinks: LinkRow[];
}) {
  const Icon = TYPE_ICON[link.content_type];
  const { lang: globalLang } = useLanguage();
  // Local override lets the user flip the detail panel without changing the
  // global preference (e.g. quickly cross-check the translation). Resolve
  // the global preference (which may be `auto`) against the link's source
  // language so the EN / বাং pill reflects an actual choice on mount.
  const [panelLang, setPanelLang] = useState<Lang>(resolveLang(globalLang, link.source_lang));
  useEffect(() => {
    setPanelLang(resolveLang(globalLang, link.source_lang));
  }, [globalLang, link.id, link.source_lang]);
  const displayTitle = pickTitle(link, panelLang) || link.url;
  const displaySummary = pickSummary(link, panelLang);
  const hasKeyPoints = Array.isArray(link.key_points) && link.key_points.length > 0;
  // We only show the per-link EN / বাং toggle when the link actually has
  // meaningful content in both languages. With auto-translate removed, most
  // links only ever populate the source language, and a button that does
  // nothing on tap is more confusing than useful.
  const enText = `${link.title?.trim() ?? ""}\n${link.summary?.trim() ?? ""}`.trim();
  const bnText = `${link.title_bn?.trim() ?? ""}\n${link.summary_bn?.trim() ?? ""}`.trim();
  const hasBothLangs = enText.length > 0 && bnText.length > 0 && enText !== bnText;
  // Hide the SUMMARY section when it is essentially the same string as the
  // title (common on Facebook / X posts where the analyzer fills both with
  // the same body text). Compared on the normalized first 200 chars so we
  // catch the "title is the full post" case without false positives on
  // genuinely different long summaries.
  const titleHead = displayTitle.replace(/\s+/g, " ").trim().slice(0, 200).toLowerCase();
  const summaryHead = displaySummary?.replace(/\s+/g, " ").trim().slice(0, 200).toLowerCase() ?? "";
  const summaryIsRedundant =
    summaryHead.length > 0 &&
    (titleHead === summaryHead ||
      titleHead.startsWith(summaryHead) ||
      summaryHead.startsWith(titleHead));
  const [tagInput, setTagInput] = useState("");
  // Confirms permanent delete from the detail panel. Soft-delete (move to
  // Recycle Bin) is reversible and doesn't need a confirmation.
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  // Similarity: rank by shared-tag count first. A same-domain match adds a
  // small bonus only for narrow/niche domains; on broad platforms (facebook,
  // x.com, youtube…) every saved link would otherwise look "similar".
  const similar = useMemo(() => {
    const myTags = new Set((link.tags ?? []).map((t) => t.toLowerCase()));
    const myDomain = link.domain ?? null;
    const domainBonusEligible = myDomain != null && !BROAD_DOMAINS.has(myDomain);
    const scored: { l: LinkRow; score: number }[] = [];
    for (const l of allLinks) {
      if (l.id === link.id || l.deleted_at) continue;
      let overlap = 0;
      for (const t of l.tags ?? []) {
        if (myTags.has(t.toLowerCase())) overlap++;
      }
      const domainMatch = domainBonusEligible && l.domain === myDomain ? 0.5 : 0;
      const score = overlap + domainMatch;
      if (score >= 1) scored.push({ l, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map((x) => x.l);
  }, [allLinks, link]);

  const addTag = async () => {
    const t = tagInput.trim();
    if (!t) return;
    await onUpdate(link.id, { tags: Array.from(new Set([...link.tags, t])) } as Partial<LinkRow>);
    setTagInput("");
  };
  const removeTag = async (t: string) => {
    await onUpdate(link.id, { tags: link.tags.filter((x) => x !== t) } as Partial<LinkRow>);
  };

  // The wrapping SheetContent already renders a close (X) button at top-right;
  // we intentionally don't render another one here to avoid the duplicate
  // overlay users were seeing.
  return (
    <div className="animate-slide-in-right p-5 pt-12 space-y-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {isTrashed ? "Link Detail · In Trash" : "Link Detail"}
        </span>
      </div>

      <div>
        <div className="flex items-start gap-3">
          <img src={faviconFor(link.url)} alt="" className="h-8 w-8 rounded" />
          <div className="flex-1 min-w-0">
            {/* line-clamp keeps long Facebook / X bodies (which the analyzer
                sometimes uses as the title) from dominating the panel. The
                full text is still available in the title attribute and below
                in the Summary section when it differs. */}
            <h2 className="font-semibold text-base leading-tight line-clamp-3" title={displayTitle}>
              {displayTitle}
            </h2>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-primary hover:underline break-all flex items-center gap-1 mt-1"
            >
              {link.domain || link.url} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition shadow-sm"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open link
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill icon={Icon} label={link.content_type} />
        <Pill
          label={link.status}
          tone={
            link.status === "ready" ? "primary" : link.status === "failed" ? "destructive" : "muted"
          }
        />
        {link.pinned && <Pill icon={Pin} label="pinned" tone="primary" />}
        {hasBothLangs && (
          <div className="ml-auto inline-flex items-center rounded-full border border-border/60 bg-background p-0.5 text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setPanelLang("en")}
              aria-pressed={panelLang === "en"}
              className={`px-2 py-0.5 rounded-full transition ${
                panelLang === "en"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setPanelLang("bn")}
              aria-pressed={panelLang === "bn"}
              className={`px-2 py-0.5 rounded-full transition ${
                panelLang === "bn"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              বাং
            </button>
          </div>
        )}
      </div>

      {!isTrashed && link.status === "ready" && (
        <StarReadReminderRow
          link={link}
          onSetPriority={onSetPriority}
          onSetRead={onSetRead}
          onSetReminder={onSetReminder}
        />
      )}

      {displaySummary && !summaryIsRedundant && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Summary
          </div>
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {displaySummary}
          </p>
        </div>
      )}

      {hasKeyPoints && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Key points
          </div>
          <ul className="space-y-1.5">
            {link.key_points.map((kp, idx) => (
              <li key={idx} className="flex gap-2 items-start text-sm leading-relaxed">
                <span className="text-primary mt-1 shrink-0">▸</span>
                <span className="text-foreground/90">{kp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Tags
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {link.tags.map((t) => (
            <button
              key={t}
              onClick={() => removeTag(t)}
              className="group font-mono text-xs px-2 py-0.5 rounded-md bg-accent text-accent-foreground hover:bg-destructive/20 hover:text-destructive"
            >
              #{t} <span className="opacity-0 group-hover:opacity-100">×</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="Add tag"
            className="h-7 text-xs font-mono"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={addTag}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 font-mono text-xs"
          onClick={() => onPin(link.id, link.pinned)}
        >
          <Star
            className={`h-3.5 w-3.5 mr-1.5 ${link.pinned ? "fill-primary text-primary" : ""}`}
          />
          {link.pinned ? "Unpin" : "Pin"}
        </Button>
        {!isTrashed &&
          (() => {
            // Show a contextual analyze button on the detail panel:
            //   * pending / failed                      -> "Retry"
            //   * ready + English source missing Bangla -> "Translate to বাং"
            //     (re-analyze fills in title_bn / summary_bn under the new prompt)
            //   * ready otherwise                       -> generic "Re-analyze"
            const isReady = link.status === "ready";
            const needsBangla =
              isReady &&
              link.source_lang !== "bn" &&
              !(link.title_bn ?? "").trim() &&
              !(link.summary_bn ?? "").trim();
            const label = isReady ? (needsBangla ? "Translate to বাং" : "Re-analyze") : "Retry";
            return (
              <Button
                size="sm"
                variant="outline"
                className="h-8 font-mono text-xs"
                onClick={() => onRetry(link.id)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {label}
              </Button>
            );
          })()}
        {isTrashed && onRestore && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 font-mono text-xs"
            onClick={() => onRestore(link.id)}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Restore
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8 font-mono text-xs text-destructive hover:bg-destructive/10"
          onClick={() => {
            if (isTrashed) {
              setPermanentDeleteOpen(true);
            } else {
              // Soft-delete is reversible from the Recycle Bin, so we apply it
              // immediately without prompting.
              onDelete(link.id);
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          {isTrashed ? "Delete forever" : "Delete"}
        </Button>
      </div>

      <AlertDialog open={permanentDeleteOpen} onOpenChange={setPermanentDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">Delete this link forever?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-medium">{displayTitle}</span> from your
              library. This action cannot be undone &mdash; it will not appear in the Recycle Bin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setPermanentDeleteOpen(false);
                onDelete(link.id);
              }}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Saved
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}
        </div>
      </div>

      {similar.length > 0 && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Similar
          </div>
          <div className="space-y-1.5">
            {similar.map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-border/50 px-2.5 py-1.5 hover:border-primary/40 hover:bg-accent/30 transition"
              >
                <div className="text-xs font-medium truncate">{pickTitle(s, panelLang)}</div>
                <div className="font-mono text-[10px] text-muted-foreground truncate">
                  {s.domain}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
  tone,
}: {
  icon?: typeof FileText;
  label: string;
  tone?: "primary" | "muted" | "destructive";
}) {
  const cls =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "destructive"
        ? "bg-destructive/10 text-destructive"
        : tone === "muted"
          ? "bg-muted text-muted-foreground"
          : "bg-accent text-accent-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md ${cls}`}
    >
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
        Add a link above or paste links in your Telegram channel and they'll appear here
        automatically.
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

function RecycleBinDialog({
  open,
  onOpenChange,
  links,
  onRestore,
  onPermanentDelete,
  onEmptyTrash,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  links: LinkRow[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onEmptyTrash: () => void;
}) {
  // Permanent deletion is irreversible — gate both the per-row delete and
  // "Empty trash" behind an explicit confirm so a fat-finger tap doesn't
  // nuke a link the user actually wanted to restore later.
  const [pendingDelete, setPendingDelete] = useState<LinkRow | null>(null);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono">Recycle bin</DialogTitle>
            <DialogDescription>Restore links or delete them permanently.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-1.5 scrollbar-thin">
            {links.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Trash is empty.</p>
            )}
            {links.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-2 rounded-xl border border-border/50 px-2 py-1.5"
              >
                <img src={faviconFor(l.url)} alt="" className="h-4 w-4 rounded" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{l.title || l.url}</div>
                  <div className="font-mono text-[10px] text-muted-foreground truncate">
                    {l.domain}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onRestore(l.id)}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive"
                  onClick={() => setPendingDelete(l)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => setEmptyConfirmOpen(true)}
              disabled={!links.length}
            >
              Empty trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingDelete !== null} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">Delete this link forever?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.title || pendingDelete?.url
                ? `"${pendingDelete.title || pendingDelete.url}" will be permanently removed. This cannot be undone.`
                : "This link will be permanently removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onPermanentDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={emptyConfirmOpen} onOpenChange={setEmptyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">Empty the trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {links.length} link{links.length === 1 ? "" : "s"} will be permanently deleted. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setEmptyConfirmOpen(false);
                onEmptyTrash();
                onOpenChange(false);
              }}
            >
              Empty trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const items = [
    ["/", "Focus search"],
    ["?", "This dialog"],
    ["g", "Toggle list/grid"],
    ["↑ ↓", "Navigate links"],
    ["Enter", "Open selected link"],
    ["Esc", "Close detail"],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {items.map(([k, l]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{l}</span>
              <kbd className="font-mono text-[11px] px-2 py-0.5 rounded-md border border-border bg-muted">
                {k}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (raw: string) => void;
}) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const extractUrls = (raw: string): string[] => {
    const matches = raw.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
    return Array.from(new Set(matches));
  };

  const handleFile = async (file: File) => {
    const content = await file.text();
    let urls: string[] = [];
    const name = file.name.toLowerCase();
    if (name.endsWith(".json")) {
      try {
        const parsed = JSON.parse(content);
        const arr = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.links)
            ? parsed.links
            : [];
        urls = arr
          .map((x: unknown) => (typeof x === "string" ? x : ((x as { url?: string })?.url ?? "")))
          .filter((s: string) => /^https?:\/\//.test(s));
      } catch {
        urls = extractUrls(content);
      }
    } else {
      // txt, csv, html bookmarks — extract any URL pattern
      urls = extractUrls(content);
    }
    if (!urls.length) return toast.error("No URLs found in file");
    setText((prev) => (prev ? prev + "\n" : "") + urls.join("\n"));
    toast.success(`Loaded ${urls.length} URLs from ${file.name}`);
  };

  const count = useMemo(() => extractUrls(text).length, [text]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">Import links</DialogTitle>
          <DialogDescription>
            Paste URLs or upload a file (.txt, .csv, .json, .html bookmarks).
          </DialogDescription>
        </DialogHeader>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,.json,.html,.htm,text/plain,text/csv,application/json,text/html"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs w-fit"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-2" />
          Choose file
        </Button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://example.com/article&#10;https://github.com/user/repo"
          className="w-full h-40 rounded-xl border border-border bg-background p-3 font-mono text-xs"
        />
        <DialogFooter className="items-center sm:justify-between">
          <span className="font-mono text-[11px] text-muted-foreground">
            {count} URL{count === 1 ? "" : "s"} detected
          </span>
          <Button
            disabled={!count}
            onClick={() => {
              onImport(text);
              setText("");
              onOpenChange(false);
            }}
          >
            Import {count > 0 && `(${count})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SmartSearchDialog({
  open,
  onOpenChange,
  links,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  links: LinkRow[];
  onPick: (id: string) => void;
}) {
  const { lang } = useLanguage();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (!q.trim()) return links.slice(0, 8);
    const t = q.toLowerCase();
    return links
      .filter(
        (l) =>
          (l.title ?? "").toLowerCase().includes(t) ||
          (l.title_bn ?? "").toLowerCase().includes(t) ||
          (l.summary ?? "").toLowerCase().includes(t) ||
          (l.summary_bn ?? "").toLowerCase().includes(t) ||
          l.tags.some((x) => x.toLowerCase().includes(t)) ||
          (l.key_points ?? []).some((k) => k.toLowerCase().includes(t)),
      )
      .slice(0, 12);
  }, [links, q]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Smart search
          </DialogTitle>
        </DialogHeader>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything across your library..."
          className="font-mono text-sm"
          autoFocus
        />
        <div className="space-y-1 max-h-80 overflow-auto scrollbar-thin">
          {results.map((l) => (
            <button
              key={l.id}
              onClick={() => onPick(l.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-accent text-left"
            >
              <img src={faviconFor(l.url)} alt="" className="h-4 w-4 rounded" />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{pickTitle(l, lang)}</div>
                <div className="font-mono text-[10px] text-muted-foreground truncate">
                  {l.domain}
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkTagDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (tag: string) => void;
}) {
  const [tag, setTag] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono">Add tag to selected</DialogTitle>
        </DialogHeader>
        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="tag-name"
          className="font-mono text-sm"
          autoFocus
        />
        <DialogFooter>
          <Button onClick={() => onApply(tag)} disabled={!tag.trim()}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniPill({
  label,
  value,
  destructive,
}: {
  label: string;
  value: number;
  destructive?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-md border border-border/50 px-1.5 py-1 ${destructive ? "bg-destructive/10 text-destructive" : "bg-muted/30"}`}
    >
      <span className="font-mono text-sm leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </span>
    </div>
  );
}

const CONTENT_TYPES: { value: "all" | ContentType; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "article", label: "Article" },
  { value: "video", label: "Video" },
  { value: "repo", label: "Repo" },
  { value: "docs", label: "Docs" },
  { value: "tool", label: "Tool" },
  { value: "thread", label: "Thread" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: { value: "all" | LinkStatus; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "ready", label: "Ready" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];

const SORT_OPTIONS: { value: FilterState["sort"]; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title-asc", label: "Title A → Z" },
  { value: "title-desc", label: "Title Z → A" },
  { value: "domain-asc", label: "Domain A → Z" },
];

function FiltersSheet({
  open,
  onOpenChange,
  filters,
  setFilters,
  stats,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  stats: { duplicates: number };
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0 overflow-y-auto flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/50 flex-row items-center justify-between">
          <div>
            <SheetTitle className="font-mono text-base">Filters</SheetTitle>
            <SheetDescription className="text-xs">Refine the visible link list</SheetDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            Reset
          </Button>
        </SheetHeader>
        <div className="flex-1 px-5 py-4 space-y-5">
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Content type
            </label>
            <Select
              value={filters.contentType}
              onValueChange={(v) =>
                setFilters({ ...filters, contentType: v as FilterState["contentType"] })
              }
            >
              <SelectTrigger className="h-9 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="font-mono text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Status
            </label>
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters({ ...filters, status: v as FilterState["status"] })}
            >
              <SelectTrigger className="h-9 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="font-mono text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Sort by
            </label>
            <Select
              value={filters.sort}
              onValueChange={(v) => setFilters({ ...filters, sort: v as FilterState["sort"] })}
            >
              <SelectTrigger className="h-9 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="font-mono text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Minimum stars
            </label>
            <div className="inline-flex rounded-md border border-border/60 bg-background p-0.5 text-xs">
              {([0, 1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFilters({ ...filters, minPriority: n })}
                  aria-pressed={filters.minPriority === n}
                  className={`px-2.5 py-1 rounded transition font-mono inline-flex items-center gap-0.5 ${
                    filters.minPriority === n
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {n === 0 ? (
                    "Any"
                  ) : (
                    <>
                      {n}
                      <Star className="h-3 w-3 fill-current" />
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Read state
            </label>
            <div className="inline-flex rounded-md border border-border/60 bg-background p-0.5 text-xs">
              {(["all", "unread", "read"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilters({ ...filters, readState: s })}
                  aria-pressed={filters.readState === s}
                  className={`px-2.5 py-1 rounded transition font-mono capitalize ${
                    filters.readState === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/50 pt-4 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-sm">
                <Pin className="h-3.5 w-3.5 text-primary" />
                Pinned only
              </span>
              <Switch
                checked={filters.pinnedOnly}
                onCheckedChange={(c) => setFilters({ ...filters, pinnedOnly: c })}
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-sm">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                Show trash
              </span>
              <Switch
                checked={filters.showDeleted}
                onCheckedChange={(c) => setFilters({ ...filters, showDeleted: c })}
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-sm">
                <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                Duplicates only
                {stats.duplicates > 0 && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    ({stats.duplicates})
                  </span>
                )}
              </span>
              <Switch
                checked={filters.showDuplicates}
                onCheckedChange={(c) => setFilters({ ...filters, showDuplicates: c })}
              />
            </label>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border/50">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
