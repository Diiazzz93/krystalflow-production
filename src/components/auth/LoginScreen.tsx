import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding";

export function LoginScreen() {
  const { signIn } = useAuth();
  const { branding } = useBranding();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error);
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
              {branding.loginLogo ? (
                <img
                  src={branding.loginLogo}
                  alt=""
                  className="size-10 rounded-md object-contain bg-muted p-1"
                />
              ) : (
                <div
                  className="size-10 rounded-md grid place-items-center font-bold text-white"
                  style={{ background: branding.primaryColor }}
                >
                  {branding.companyName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <CardTitle className="text-xl">{branding.companyName}</CardTitle>
                <CardDescription>{branding.appName} access</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={onSignIn} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="si-email" className="text-xs text-muted-foreground">
                  Email
                </Label>
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
                <Label htmlFor="si-pass" className="text-xs text-muted-foreground">
                  Password
                </Label>
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
              <p className="text-xs text-muted-foreground">
                Accounts are created by an administrator. Ask them for an invite if you need access.
              </p>
            </form>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 border border-red-500/30 bg-red-500/10 rounded p-2">
                <AlertCircle className="size-4 shrink-0" /> {error}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
