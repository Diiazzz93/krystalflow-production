import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StockItem } from "@/lib/stock";
import { useStockStore, type AdjustmentType } from "@/lib/stock-store";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  item: StockItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const TYPES: { value: AdjustmentType; label: string; hint: string }[] = [
  { value: "received", label: "Stock received", hint: "Add a positive quantity received" },
  { value: "damaged", label: "Damaged / lost", hint: "Remove damaged or lost stock" },
  { value: "correction", label: "Correction", hint: "Positive or negative correction" },
  { value: "stocktake", label: "Stocktake", hint: "Set the new counted total" },
];

export function AdjustStockDialog({ item, open, onOpenChange }: Props) {
  const { adjustStock } = useStockStore();
  const { user } = useAuth();
  const [type, setType] = useState<AdjustmentType>("received");
  const [qty, setQty] = useState("0");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType("received");
      setQty("0");
      setReason("");
      setNotes("");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  const typeInfo = TYPES.find((t) => t.value === type)!;

  const preview = useMemo(() => {
    if (!item) return null;
    const n = Number(qty);
    if (!Number.isFinite(n)) return null;
    const prev = item.quantityOnHand;
    let next: number;
    let delta: number;
    if (type === "stocktake") {
      next = n;
      delta = n - prev;
    } else if (type === "received") {
      delta = Math.abs(n);
      next = prev + delta;
    } else if (type === "damaged") {
      delta = -Math.abs(n);
      next = prev + delta;
    } else {
      delta = n;
      next = prev + delta;
    }
    return { prev, next, delta };
  }, [item, qty, type]);

  if (!item) return null;

  const submit = async () => {
    if (!preview) return;
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    if (preview.next < 0) {
      toast.error("Resulting quantity cannot be negative");
      return;
    }
    if (preview.delta === 0) {
      toast.error("No change to apply");
      return;
    }
    let value: number;
    if (type === "stocktake") value = preview.next;
    else if (type === "received") value = Math.abs(Number(qty));
    else if (type === "damaged") value = -Math.abs(Number(qty));
    else value = Number(qty);

    setSaving(true);
    await adjustStock(item.id, {
      adjustmentType: type,
      value,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
      adjustmentDate: date,
    });
    setSaving(false);
    toast.success(`Stock updated to ${preview.next.toLocaleString()} ${item.unit}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Stock adjustment</DialogTitle>
          <DialogDescription>
            {item.name} ({item.sku}) — current: {item.quantityOnHand.toLocaleString()} {item.unit}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Adjustment type
            </Label>
            <Select value={type} onValueChange={(v) => setType(v as AdjustmentType)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{typeInfo.hint}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {type === "stocktake" ? "New total" : "Quantity"}
              </Label>
              <Input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="h-11 tabular-nums"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Date
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. PO #1234 received, damaged on line, weekly stocktake"
              className="h-11"
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Notes
            </Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {preview && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Previous</span>
                <span className="tabular-nums font-medium">
                  {preview.prev.toLocaleString()} {item.unit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Change</span>
                <span
                  className={cn(
                    "tabular-nums font-medium",
                    preview.delta > 0 && "text-emerald-500",
                    preview.delta < 0 && "text-red-500",
                  )}
                >
                  {preview.delta > 0 ? "+" : ""}
                  {preview.delta.toLocaleString()} {item.unit}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">New total</span>
                <span className="tabular-nums font-semibold">
                  {preview.next.toLocaleString()} {item.unit}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Recorded by {user?.name ?? user?.email ?? "current user"}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="h-11">
            {saving ? "Saving…" : "Apply adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
