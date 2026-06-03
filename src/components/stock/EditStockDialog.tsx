import { useEffect, useState } from "react";
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
import { STOCK_CATEGORIES, type StockCategory, type StockItem } from "@/lib/stock";
import { useStockStore } from "@/lib/stock-store";
import { toast } from "sonner";

interface Props {
  item: StockItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const UNITS = ["bottles", "caps", "rolls", "boxes", "pallets", "L", "kg", "units", "IBC"];

export function EditStockDialog({ item, open, onOpenChange }: Props) {
  const { updateItem } = useStockStore();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState<StockCategory>("Other");
  const [unit, setUnit] = useState("units");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setSku(item.sku);
      setCategory(item.category ?? "Other");
      setUnit(item.unit);
      setLocation(item.location);
      setNotes(item.notes ?? "");
    }
  }, [item]);

  if (!item) return null;

  const submit = async () => {
    if (!name.trim() || !sku.trim()) {
      toast.error("Item name and SKU are required");
      return;
    }
    setSaving(true);
    await updateItem(item.id, {
      name: name.trim(),
      sku: sku.trim(),
      category,
      unit,
      location: location.trim(),
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    toast.success("Stock item updated");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit stock item</DialogTitle>
          <DialogDescription>
            Update item details. Use Stock Adjustment to change quantities.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Item name <span className="text-destructive">*</span>
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              SKU <span className="text-destructive">*</span>
            </Label>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="h-11 font-mono"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Category
            </Label>
            <Select value={category} onValueChange={(v) => setCategory(v as StockCategory)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Unit of measure
            </Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Location
            </Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Notes
            </Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="h-11">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
