import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Save, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_LABELS,
  SYNC_CATEGORIES,
  getCredentials,
  getSyncState,
  saveCredentials,
  subscribe,
  syncAll,
} from "@/lib/unleashed/sync-service";
import { MOCK_WAREHOUSES } from "@/lib/unleashed/mock-data";
import type { SyncStatus, UnleashedCredentials } from "@/lib/unleashed/types";

function statusBadge(status: SyncStatus) {
  if (status === "success")
    return (
      <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
        <CheckCircle2 className="size-3 mr-1" /> Synced
      </Badge>
    );
  if (status === "syncing")
    return (
      <Badge variant="secondary" className="bg-blue-500/15 text-blue-400 border-blue-500/30">
        <RefreshCw className="size-3 mr-1 animate-spin" /> Syncing
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="secondary" className="bg-red-500/15 text-red-400 border-red-500/30">
        <AlertCircle className="size-3 mr-1" /> Error
      </Badge>
    );
  return (
    <Badge variant="secondary">
      <Clock className="size-3 mr-1" /> Idle
    </Badge>
  );
}

function formatTime(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString();
}

export function UnleashedSyncPanel() {
  const [creds, setCreds] = useState<UnleashedCredentials>(() => getCredentials());
  const [state, setState] = useState(() => getSyncState());
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribe(() => setState(getSyncState())), []);

  function save() {
    saveCredentials(creds);
    toast.success("Unleashed credentials saved");
  }

  async function runSync() {
    setBusy(true);
    try {
      const result = await syncAll();
      if (result.status === "success") toast.success("Inventory sync complete");
      else toast.error(`Sync finished with errors: ${result.lastError ?? "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Unleashed inventory sync</CardTitle>
          <CardDescription>
            Connect Unleashed to keep stock levels for bottles, caps, labels, cartons, and
            liquid/IBCs up to date. Mock mode is active — sync uses bundled demo data.
          </CardDescription>
        </div>
        <Button onClick={runSync} disabled={busy}>
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border border-border bg-accent/30 p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
          <span className="text-muted-foreground">
            Choose what to sync and map Unleashed products to KrystalFlow categories.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to="/unleashed-sync">Open sync &amp; mapping →</Link>
          </Button>
        </div>
        <section className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">API ID</Label>
            <Input
              value={creds.apiId}
              onChange={(e) => setCreds({ ...creds, apiId: e.target.value })}
              placeholder="Unleashed API ID"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input
              type="password"
              value={creds.apiKey}
              onChange={(e) => setCreds({ ...creds, apiKey: e.target.value })}
              placeholder="Unleashed API Key"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Warehouse</Label>
            <Select
              value={creds.warehouseCode || undefined}
              onValueChange={(v) => setCreds({ ...creds, warehouseCode: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {MOCK_WAREHOUSES.map((w) => (
                  <SelectItem key={w.WarehouseCode} value={w.WarehouseCode}>
                    {w.WarehouseName} ({w.WarehouseCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={save}>
              <Save className="size-4" /> Save credentials
            </Button>
          </div>
        </section>

        <section className="rounded-md border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Sync status</div>
              <div className="text-xs text-muted-foreground">
                Last sync: {formatTime(state.lastSyncAt)}
              </div>
            </div>
            {statusBadge(state.status)}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SYNC_CATEGORIES.map((cat) => {
              const r = state.results.find((x) => x.category === cat);
              return (
                <div
                  key={cat}
                  className="rounded-md border border-border bg-card/50 p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{CATEGORY_LABELS[cat]}</div>
                    <div className="text-xs text-muted-foreground">
                      {r ? `${r.itemsSynced} items · ${formatTime(r.finishedAt)}` : "Not yet synced"}
                    </div>
                  </div>
                  {statusBadge(r?.status ?? "idle")}
                </div>
              );
            })}
          </div>

          {state.lastError && (
            <div className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded p-2">
              {state.lastError}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
