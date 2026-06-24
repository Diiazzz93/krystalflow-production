import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Bell, ChevronDown, Mail, Pencil, Save, Search, X } from "lucide-react";
import { useStockStore } from "@/lib/stock-store";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { getStockStatus, STOCK_CATEGORIES, type StockItem, type StockStatus } from "@/lib/stock";
import { WeeklyEmailPreviewDialog } from "@/components/stock/WeeklyEmailPreviewDialog";
import { FinishedGoodsGroupsPicker } from "@/components/settings/FinishedGoodsGroupsPicker";
import { cn } from "@/lib/utils";

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

const STATUS_DOT: Record<StockStatus, string> = {
  "out-of-stock": "bg-red-500",
  "critical-stock": "bg-orange-500",
  "low-stock": "bg-yellow-500",
  "in-stock": "bg-emerald-500",
};

const STATUS_LABEL: Record<StockStatus, string> = {
  "out-of-stock": "Out of stock",
  "critical-stock": "Critical",
  "low-stock": "Low",
  "in-stock": "OK",
};

export function StockAlertsPanel() {
  const { items, updateItem } = useStockStore();
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "manager");

  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...items]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((i) => {
        if (category !== "all" && (i.category ?? "Other") !== category) return false;
        const status = getStockStatus(i);
        if (statusFilter === "attention" && status === "in-stock") return false;
        if (statusFilter === "ok" && status !== "in-stock") return false;
        if (!t) return true;
        return (
          i.name.toLowerCase().includes(t) ||
          i.sku.toLowerCase().includes(t) ||
          (i.supplier ?? "").toLowerCase().includes(t)
        );
      });
  }, [items, q, category, statusFilter]);

  const get = (i: StockItem) => drafts[i.id] ?? toDraft(i);
  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? toDraft(items.find((x) => x.id === id)!)), ...patch },
    }));

  const dirtyIds = Object.keys(drafts);
  const dirtyCount = dirtyIds.length;

  const discardAll = () => setDrafts({});

  const saveAll = async () => {
    if (!dirtyCount) return;
    setSaving(true);
    let ok = 0;
    let fail = 0;
    for (const id of dirtyIds) {
      const item = items.find((x) => x.id === id);
      if (!item) continue;
      const d = drafts[id];
      try {
        await updateItem(id, {
          reorderLevel: Number(d.reorderLevel) || 0,
          criticalLevel: Number(d.criticalLevel) || 0,
          reorderQuantity: Number(d.reorderQuantity) || 0,
          supplier: d.supplier.trim() || undefined,
          alertNotes: d.alertNotes.trim() || undefined,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setSaving(false);
    setDrafts({});
    if (fail === 0) toast.success(`Saved ${ok} item${ok === 1 ? "" : "s"}`);
    else toast.error(`Saved ${ok}, failed ${fail}`);
  };

  const editingItem = editingId ? items.find((i) => i.id === editingId) ?? null : null;

  const summary = useMemo(() => {
    let attention = 0;
    for (const i of items) if (getStockStatus(i) !== "in-stock") attention++;
    return { total: items.length, attention };
  }, [items]);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4" /> Stock Alert Settings
              <Badge variant="outline" className="ml-1 font-normal">
                {summary.total} items
              </Badge>
              {summary.attention > 0 && (
                <Badge variant="destructive" className="font-normal">
                  {summary.attention} need attention
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Set low, critical and reorder thresholds per item. Used by the stock page,
              dashboard alerts and the weekly stock email.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              className="gap-2"
            >
              <Mail className="size-3.5" /> Weekly email
            </Button>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={open ? "Collapse" : "Expand"}>
                <ChevronDown
                  className={cn("size-4 transition-transform", open && "rotate-180")}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-3">
            <FinishedGoodsGroupsPicker canEdit={canEdit} />

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search item, SKU or supplier"
                  className="pl-8 h-9"
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {STOCK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="attention">Needs attention</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!canEdit && (
              <div className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
                You have read-only access. Only Admins and Managers can change alert settings.
              </div>
            )}

            <div className="rounded-md border border-border overflow-hidden">
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-card border-b border-border">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left font-medium px-3 py-2 w-6"></th>
                      <th className="text-left font-medium px-2 py-2">Item</th>
                      <th className="text-right font-medium px-2 py-2 w-24">On hand</th>
                      <th className="text-left font-medium px-2 py-2 w-24">Low &lt;</th>
                      <th className="text-left font-medium px-2 py-2 w-24">Critical &lt;</th>
                      <th className="text-left font-medium px-2 py-2 w-24">Reorder qty</th>
                      <th className="text-left font-medium px-2 py-2 w-40">Supplier</th>
                      <th className="text-right font-medium px-2 py-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((i) => {
                      const d = get(i);
                      const dirty = drafts[i.id] !== undefined;
                      const status = getStockStatus(i);
                      return (
                        <tr
                          key={i.id}
                          className={cn(
                            "border-b border-border/60 last:border-0 hover:bg-muted/30",
                            dirty && "bg-primary/5",
                          )}
                        >
                          <td className="px-3 py-1.5">
                            <span
                              className={cn("block size-2 rounded-full", STATUS_DOT[status])}
                              title={STATUS_LABEL[status]}
                            />
                          </td>
                          <td className="px-2 py-1.5 min-w-0">
                            <div className="font-medium truncate">{i.name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground truncate">
                              {i.sku} · {i.category ?? "Other"}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {i.availableStock.toLocaleString()}
                            <span className="text-muted-foreground ml-1">{i.unit}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={d.reorderLevel}
                              onChange={(e) => set(i.id, { reorderLevel: e.target.value })}
                              disabled={!canEdit}
                              className="h-8 px-2 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={d.criticalLevel}
                              onChange={(e) => set(i.id, { criticalLevel: e.target.value })}
                              disabled={!canEdit}
                              className="h-8 px-2 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={d.reorderQuantity}
                              onChange={(e) => set(i.id, { reorderQuantity: e.target.value })}
                              disabled={!canEdit}
                              className="h-8 px-2 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={d.supplier}
                              onChange={(e) => set(i.id, { supplier: e.target.value })}
                              disabled={!canEdit}
                              placeholder="—"
                              className="h-8 px-2"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => setEditingId(i.id)}
                              aria-label="Edit notes"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                          No stock items match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {canEdit && dirtyCount > 0 && (
              <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium">{dirtyCount}</span> item
                  {dirtyCount === 1 ? "" : "s"} modified
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={discardAll}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    <X className="size-3.5" /> Discard
                  </Button>
                  <Button size="sm" onClick={saveAll} disabled={saving} className="gap-1.5">
                    <Save className="size-3.5" />
                    {saving ? "Saving…" : `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <Sheet open={editingItem !== null} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent className="sm:max-w-md">
          {editingItem && (
            <EditDrawerContent
              item={editingItem}
              draft={get(editingItem)}
              canEdit={canEdit}
              onChange={(patch) => set(editingItem.id, patch)}
              onClose={() => setEditingId(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <WeeklyEmailPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} />
    </Card>
  );
}

function EditDrawerContent({
  item,
  draft,
  canEdit,
  onChange,
  onClose,
}: {
  item: StockItem;
  draft: Draft;
  canEdit: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onClose: () => void;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{item.name}</SheetTitle>
        <SheetDescription className="font-mono text-xs">
          {item.sku} · on hand {item.availableStock.toLocaleString()} {item.unit}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 py-4">
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Low below"
            value={draft.reorderLevel}
            onChange={(v) => onChange({ reorderLevel: v })}
            disabled={!canEdit}
          />
          <Field
            label="Critical below"
            value={draft.criticalLevel}
            onChange={(v) => onChange({ criticalLevel: v })}
            disabled={!canEdit}
          />
          <Field
            label="Reorder qty"
            value={draft.reorderQuantity}
            onChange={(v) => onChange({ reorderQuantity: v })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Preferred supplier</Label>
          <Input
            value={draft.supplier}
            onChange={(e) => onChange({ supplier: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea
            rows={5}
            value={draft.alertNotes}
            onChange={(e) => onChange({ alertNotes: e.target.value })}
            disabled={!canEdit}
            placeholder="Lead time, reorder steps, supplier contact…"
          />
        </div>
      </div>

      <SheetFooter>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </SheetFooter>
    </>
  );
}

function Field({
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
        className="text-right tabular-nums"
      />
    </div>
  );
}
