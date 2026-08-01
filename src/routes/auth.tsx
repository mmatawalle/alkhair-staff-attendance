import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Clock, Eye, EyeOff, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s) =>
    z
      .object({
        redirect: z.string().optional(),
        mode: z.enum(["signin", "signup", "forgot", "update-password"]).optional(),
      })
      .parse(s),
  head: () => ({ meta: [{ title: "Sign in — TimeClock" }] }),
  component: AuthPage,
});

function safeRedirect(target: string | undefined): string {
  if (!target) return "/dashboard";
  if (!target.startsWith("/") || target.startsWith("//")) return "/dashboard";
  return target;
}

function AuthPage() {
  const { redirect: redirectTo, mode: urlMode } = Route.useSearch();
  const target = safeRedirect(redirectTo);

  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "update-password">(() => {
    if (urlMode === "update-password") return "update-password";
    return "signin";
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Sync mode if URL search query changes
  useEffect(() => {
    if (urlMode) {
      setMode(urlMode);
    }
  }, [urlMode]);

  const goNext = () => {
    window.location.href = target;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in successfully");
        goNext();
      } else if (mode === "signup") {
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
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?mode=update-password`,
        });
        if (error) throw error;
        toast.success("Password reset email sent! Please check your inbox.");
        setMode("signin");
      } else if (mode === "update-password") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password updated successfully!");
        goNext();
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
            <CardTitle>
              {mode === "forgot"
                ? "Reset Password"
                : mode === "update-password"
                  ? "Update Password"
                  : "Welcome"}
            </CardTitle>
            <CardDescription>
              {mode === "forgot"
                ? "Enter your email address to receive a recovery link."
                : mode === "update-password"
                  ? "Create a new secure password for your account."
                  : "Sign in or create an account to clock in."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mode === "forgot" || mode === "update-password" ? (
              /* Forgot / Reset Forms */
              <form onSubmit={submit} className="space-y-4">
                {mode === "forgot" ? (
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="pw">New Password</Label>
                      <div className="relative">
                        <Input
                          id="pw"
                          type={showPassword ? "text" : "password"}
                          name="password"
                          autoComplete="new-password"
                          minLength={8}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="confirm-pw">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          id="confirm-pw"
                          type={showPassword ? "text" : "password"}
                          name="confirm-password"
                          autoComplete="new-password"
                          minLength={8}
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Please wait…" : mode === "forgot" ? "Send Reset Link" : "Update Password"}
                </Button>

                {mode === "forgot" && (
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full py-1 cursor-pointer"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back to Sign in
                  </button>
                )}
              </form>
            ) : (
              /* Sign In / Sign Up Forms */
              <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>
                <form onSubmit={submit} className="space-y-3">
                  <TabsContent value="signup" className="space-y-3 mt-0">
                    <div className="space-y-1">
                      <Label htmlFor="name">Full name</Label>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="name"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required={mode === "signup"}
                      />
                    </div>
                  </TabsContent>
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="pw">Password</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={() => setMode("forgot")}
                          className="text-xs text-primary hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="pw"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        minLength={8}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full mt-2" disabled={loading}>
                    {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                  </Button>
                  {mode === "signup" && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      The first account becomes the admin automatically.
                    </p>
                  )}
                </form>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
