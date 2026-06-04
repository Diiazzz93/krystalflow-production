import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bell, Mail, Save, Search } from "lucide-react";
import { useStockStore } from "@/lib/stock-store";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { StockItem } from "@/lib/stock";
import { WeeklyEmailPreviewDialog } from "@/components/stock/WeeklyEmailPreviewDialog";

interface Draft {
  reorderLevel: string;
  criticalLevel: string;
  reorderQuantity: string;
  supplier: string;
  alertNotes: string;
}

function toDraft(i: StockItem): Draft {
  return {
    reorderLevel: String(i.reorderLevel ?? 0),
    criticalLevel: String(i.criticalLevel ?? 0),
    reorderQuantity: String(i.reorderQuantity ?? 0),
    supplier: i.supplier ?? "",
    alertNotes: i.alertNotes ?? "",
  };
}

export function StockAlertsPanel() {
  const { items, updateItem } = useStockStore();
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "manager");
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    const t = q.toLowerCase();
    return sorted.filter(
      (i) =>
        i.name.toLowerCase().includes(t) ||
        i.sku.toLowerCase().includes(t) ||
        (i.supplier ?? "").toLowerCase().includes(t),
    );
  }, [items, q]);

  const get = (i: StockItem) => drafts[i.id] ?? toDraft(i);
  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? toDraft(items.find((x) => x.id === id)!)), ...patch } }));

  const save = async (i: StockItem) => {
    const d = get(i);
    setSavingId(i.id);
    await updateItem(i.id, {
      reorderLevel: Number(d.reorderLevel) || 0,
      criticalLevel: Number(d.criticalLevel) || 0,
      reorderQuantity: Number(d.reorderQuantity) || 0,
      supplier: d.supplier.trim() || undefined,
      alertNotes: d.alertNotes.trim() || undefined,
    });
    setSavingId(null);
    setDrafts((prev) => {
      const { [i.id]: _, ...rest } = prev;
      return rest;
    });
    toast.success(`Alert settings saved for ${i.name}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4" /> Stock Alert Settings
          </CardTitle>
          <CardDescription>
            Set low, critical and reorder thresholds per item. Used by the stock page, dashboard
            alerts and the weekly stock email.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-2">
          <Mail className="size-4" /> Preview weekly email
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search item, SKU or supplier"
            className="pl-8"
          />
        </div>

        {!canEdit && (
          <div className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
            You have read-only access. Only Admins and Managers can change alert settings.
          </div>
        )}

        <div className="space-y-3">
          {filtered.map((i) => {
            const d = get(i);
            const dirty = drafts[i.id] !== undefined;
            return (
              <div
                key={i.id}
                className="rounded-md border border-border bg-card p-3 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{i.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {i.sku} · on hand {i.availableStock.toLocaleString()} {i.unit}
                    </div>
                  </div>
                  {i.category && <Badge variant="outline">{i.category}</Badge>}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <NumField
                    label="Low stock below"
                    value={d.reorderLevel}
                    onChange={(v) => set(i.id, { reorderLevel: v })}
                    disabled={!canEdit}
                  />
                  <NumField
                    label="Critical below"
                    value={d.criticalLevel}
                    onChange={(v) => set(i.id, { criticalLevel: v })}
                    disabled={!canEdit}
                  />
                  <NumField
                    label="Reorder quantity"
                    value={d.reorderQuantity}
                    onChange={(v) => set(i.id, { reorderQuantity: v })}
                    disabled={!canEdit}
                  />
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Preferred supplier</Label>
                    <Input
                      value={d.supplier}
                      onChange={(e) => set(i.id, { supplier: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Textarea
                      rows={1}
                      value={d.alertNotes}
                      onChange={(e) => set(i.id, { alertNotes: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                {canEdit && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => save(i)}
                      disabled={!dirty || savingId === i.id}
                      className="gap-2"
                    >
                      <Save className="size-3.5" />
                      {savingId === i.id ? "Saving…" : "Save"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No stock items match your search.
            </div>
          )}
        </div>
      </CardContent>

      <WeeklyEmailPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} />
    </Card>
  );
}

function NumField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
