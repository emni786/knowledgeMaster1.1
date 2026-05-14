import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";
import {
  Activity, Compass, Network, BarChart3, Newspaper, Settings,
  Library as LibraryIcon, Menu,
} from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/library", label: "Library", icon: LibraryIcon },
  { to: "/dashboard", label: "Dashboard", icon: Activity },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/knowledge", label: "Knowledge", icon: Network },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/digest", label: "Digest", icon: Newspaper },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavList({ onNav }: { onNav?: () => void }) {
  return (
    <nav className="px-2 py-3 space-y-0.5">
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNav}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-primary/10 hover:text-primary transition-colors font-medium text-muted-foreground"
          activeProps={{ className: "bg-primary/10 text-primary" }}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="lg:grid lg:grid-cols-[260px_1fr] min-h-screen">
        <aside className="hidden lg:flex border-r border-border/50 bg-sidebar text-sidebar-foreground flex-col h-screen sticky top-0">
          <div className="p-4 border-b border-border/50">
            <Wordmark collapsed={false} />
          </div>
          <NavList />
          <div className="mt-auto p-3 border-t border-border/50 flex items-center gap-2">
            <ThemeToggle />
          </div>
        </aside>

        <div className="flex flex-col min-h-screen">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/50 bg-background/80 px-4 backdrop-blur">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <div className="p-4 border-b border-border/50"><Wordmark collapsed={false} /></div>
                <NavList />
              </SheetContent>
            </Sheet>
            <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          </header>

          <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10">
            <div className="mx-auto max-w-6xl space-y-8">
              <section>
                <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">{title}</h2>
                {description && <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{description}</p>}
              </section>
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
