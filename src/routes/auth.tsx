import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s) => z.object({ redirect: z.string().optional() }).parse(s),
  head: () => ({ meta: [{ title: "Sign in — TimeClock" }] }),
  component: AuthPage,
});

function safeRedirect(target: string | undefined): string {
  if (!target) return "/dashboard";
  // Only allow same-origin relative paths
  if (!target.startsWith("/") || target.startsWith("//")) return "/dashboard";
  return target;
}

function AuthPage() {
  useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const target = safeRedirect(redirectTo);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const goNext = () => {
    // Use raw href to preserve query params like ?code=
    window.location.href = target;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        goNext();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + target,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created — you can sign in.");
        const { error: err2 } = await supabase.auth.signInWithPassword({ email, password });
        if (!err2) goNext();
        else setMode("signin");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6 text-xl font-semibold">
          <Clock className="h-6 w-6 text-primary" /> TimeClock
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or create an account to clock in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
              <TabsList className="grid grid-cols-2 mb-4">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <form onSubmit={submit} className="space-y-3">
                <TabsContent value="signup" className="space-y-3 mt-0">
                  <div className="space-y-1">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required={mode === "signup"} />
                  </div>
                </TabsContent>
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pw">Password</Label>
                  <Input id="pw" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                </Button>
                {mode === "signup" && (
                  <p className="text-xs text-muted-foreground text-center">
                    The first account becomes the admin automatically.
                  </p>
                )}
              </form>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
