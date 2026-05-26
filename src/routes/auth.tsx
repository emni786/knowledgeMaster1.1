import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Knowledgemaster" },
      { name: "description", content: "Sign in to your AI link librarian." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/library" });
  },
  component: AuthPage,
});

// Canonical public URL of the deployed app. Set `VITE_PUBLIC_APP_URL` in
// Vercel (and any other host) so that auth flows always send the user back
// to the canonical domain instead of whichever preview/staging origin they
// happened to click sign-in from. Falls back to the current browser origin
// for local dev (`bun run dev` on localhost).
function canonicalOrigin(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "https://knowledge-master1-1.vercel.app";
}

// Google sign-in is intentionally hidden by default. The Supabase project's
// hosted-auth callback shows the raw `<ref>.supabase.co` subdomain on the
// Google account-picker, which leaks the Supabase project ref and looks
// unbranded. We keep the implementation around so we can flip it back on
// once a Supabase custom auth domain is configured — set
// `VITE_ENABLE_GOOGLE_AUTH=true` in Vercel to surface the button again.
function googleAuthEnabled(): boolean {
  const v = import.meta.env.VITE_ENABLE_GOOGLE_AUTH as string | undefined;
  return typeof v === "string" && v.toLowerCase() === "true";
}

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    window.location.href = `${canonicalOrigin()}/library`;
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${canonicalOrigin()}/library` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — check your email if confirmation is required");
    window.location.href = `${canonicalOrigin()}/library`;
  };

  const reset = async () => {
    if (!email) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${canonicalOrigin()}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Reset link sent");
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    // Build the OAuth URL ourselves so we can pre-flight it. If the project
    // hasn't enabled the Google provider, Supabase returns a 400 JSON error
    // page instead of a redirect to Google — without this probe the browser
    // would navigate to that raw JSON and the user just sees an opaque
    // {"code":400,"error_code":"validation_failed","msg":"Unsupported provider…"}.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${canonicalOrigin()}/library`,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    const oauthUrl = data?.url;
    if (!oauthUrl) {
      setLoading(false);
      return toast.error("Could not start Google sign-in. Try again.");
    }
    try {
      const probe = await fetch(oauthUrl, { redirect: "manual" });
      if (probe.type !== "opaqueredirect" && probe.status >= 400) {
        let detail = "";
        try {
          const body = (await probe.clone().json()) as { msg?: string };
          if (body.msg) detail = ` (${body.msg})`;
        } catch {
          // body wasn't JSON — ignore
        }
        setLoading(false);
        return toast.error(
          `Google sign-in isn't enabled on this Supabase project${detail}. Use email sign-in below, or ask the admin to enable Google in Supabase → Authentication → Providers.`,
        );
      }
    } catch {
      // Probe failed for network / CORS reasons; fall through and let the
      // browser try the redirect normally so a working setup still works.
    }
    window.location.href = oauthUrl;
  };

  const showGoogle = googleAuthEnabled();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-background via-background to-accent/30">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="flex flex-col items-center gap-3 mb-8">
          <Logo size={48} />
          <div className="text-center">
            <h1 className="font-mono text-xl font-semibold">Knowledgemaster</h1>
            <p className="text-xs text-muted-foreground mt-1">Your AI-powered link library</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm space-y-4">
          {showGoogle && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={signInWithGoogle}
                className="w-full font-mono text-xs"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.74-6-6.1s2.7-6.1 6-6.1c1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.86 3.43 14.66 2.5 12 2.5 6.97 2.5 2.9 6.57 2.9 11.6S6.97 20.7 12 20.7c6.93 0 9.1-4.86 9.1-7.4 0-.5-.06-.88-.13-1.1H12z"
                  />
                </svg>
                Continue with Google
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  or
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2 font-mono text-xs">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-4">
              <form onSubmit={signIn} className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="font-mono text-[11px] uppercase tracking-wider">Email</Label>
                  <Input
                    className="h-9 font-mono text-sm"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[11px] uppercase tracking-wider">Password</Label>
                  <Input
                    className="h-9 font-mono text-sm"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full font-mono text-xs">
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
                <button
                  type="button"
                  onClick={reset}
                  className="text-xs text-muted-foreground hover:text-primary w-full text-center"
                >
                  Forgot password?
                </button>
              </form>
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <form onSubmit={signUp} className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="font-mono text-[11px] uppercase tracking-wider">Email</Label>
                  <Input
                    className="h-9 font-mono text-sm"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[11px] uppercase tracking-wider">Password</Label>
                  <Input
                    className="h-9 font-mono text-sm"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full font-mono text-xs">
                  {loading ? "Creating..." : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
