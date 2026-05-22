import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LogIn, AlertCircle } from "lucide-react";
import { MOCK_USERS, ROLE_LABELS, useAuth } from "@/lib/auth";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error);
  }

  function quickFill(em: string, pw: string) {
    setEmail(em);
    setPassword(pw);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold">
                K
              </div>
              <div>
                <CardTitle className="text-xl">Krystalshield</CardTitle>
                <CardDescription>Sign in to the production scheduler</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@krystalflow.app"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400 border border-red-500/30 bg-red-500/10 rounded p-2">
                  <AlertCircle className="size-4" /> {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                <LogIn className="size-4" /> {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="border-t border-border pt-4 space-y-2">
              <div className="text-xs text-muted-foreground">
                Demo accounts (click to fill — password matches the role):
              </div>
              <div className="grid gap-1.5">
                {MOCK_USERS.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => quickFill(u.email, u.password)}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/50 hover:bg-accent px-3 py-2 text-left text-sm transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
