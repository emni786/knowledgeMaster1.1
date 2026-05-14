import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge — Xenonowledge" },
      { name: "description", content: "Visualize connections across your saved knowledge." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/50 bg-background/80 px-4 backdrop-blur">
        <Link to="/library">
          <Button variant="ghost" size="icon" className="h-9 w-9"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-sm font-semibold tracking-tight">Knowledge</h1>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="font-display text-3xl font-semibold">Knowledge graph</h2>
        <p className="mt-2 text-sm text-muted-foreground">Visualize connections across your saved knowledge.</p>
      </main>
    </div>
  );
}
