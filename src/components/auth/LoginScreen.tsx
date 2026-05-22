import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LogIn, AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error);
  }

  async function onSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    const { error, needsConfirmation } = await signUp(email, password, name);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    if (needsConfirmation) {
      setInfo("Check your inbox to confirm your email, then sign in.");
      setMode("signin");
    }
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
                <CardDescription>Production scheduler access</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as "signin" | "signup"); setError(null); setInfo(null); }}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-4">
                <form onSubmit={onSignIn} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="si-email" className="text-xs text-muted-foreground">Email</Label>
                    <Input
                      id="si-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="si-pass" className="text-xs text-muted-foreground">Password</Label>
                    <Input
                      id="si-pass"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    <LogIn className="size-4" /> {busy ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-4">
                <form onSubmit={onSignUp} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="su-name" className="text-xs text-muted-foreground">Full name</Label>
                    <Input
                      id="su-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-email" className="text-xs text-muted-foreground">Email</Label>
                    <Input
                      id="su-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-pass" className="text-xs text-muted-foreground">Password</Label>
                    <Input
                      id="su-pass"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    <UserPlus className="size-4" /> {busy ? "Creating account…" : "Create account"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    The first account created becomes the administrator. Additional accounts start
                    as <span className="font-medium text-foreground">Viewer</span> and must be
                    promoted by an admin.
                  </p>
                </form>
              </TabsContent>
            </Tabs>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 border border-red-500/30 bg-red-500/10 rounded p-2">
                <AlertCircle className="size-4 shrink-0" /> {error}
              </div>
            )}
            {info && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded p-2">
                <CheckCircle2 className="size-4 shrink-0" /> {info}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
