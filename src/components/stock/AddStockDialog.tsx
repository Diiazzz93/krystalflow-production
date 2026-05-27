import { useState } from "react";
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
import { STOCK_CATEGORIES, type StockCategory } from "@/lib/stock";
import { useStockStore } from "@/lib/stock-store";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const UNITS = ["bottles", "caps", "rolls", "boxes", "pallets", "L", "kg", "units", "IBC"];

export function AddStockDialog({ open, onOpenChange }: Props) {
  const { addItem } = useStockStore();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState<StockCategory>("Other");
  const [quantity, setQuantity] = useState("0");
  const [unit, setUnit] = useState("units");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [dateReceived, setDateReceived] = useState(
    () => new Date().toISOString().slice(0, 10),
  );

  const reset = () => {
    setName("");
    setSku("");
    setCategory("Other");
    setQuantity("0");
    setUnit("units");
    setLocation("");
    setSource("");
    setNotes("");
    setDateReceived(new Date().toISOString().slice(0, 10));
  };

  const submit = () => {
    if (!name.trim() || !sku.trim()) {
      toast.error("Item name and SKU are required");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Quantity must be a non-negative number");
      return;
    }
    addItem({
      name,
      sku,
      category,
      quantityOnHand: qty,
      unit,
      location,
      source,
      notes,
      dateReceived,
    });
    toast.success(`Added ${name} to stock`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add stock</DialogTitle>
          <DialogDescription>
            Manually add a new stock item. Available stock starts equal to the quantity received.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AquaPure 750ml Bottle" className="h-11" />
          </Field>
          <Field label="SKU" required>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. AQP-750" className="h-11 font-mono" />
          </Field>

          <Field label="Category">
            <Select value={category} onValueChange={(v) => setCategory(v as StockCategory)}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STOCK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-11 tabular-nums" />
            </Field>
            <Field label="Unit">
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Stock location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Warehouse A — Bay 1" className="h-11" />
          </Field>
          <Field label="Supplier / customer source">
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Plastica Ltd" className="h-11" />
          </Field>

          <Field label="Date received">
            <Input type="date" value={dateReceived} onChange={(e) => setDateReceived(e.target.value)} className="h-11" />
          </Field>

          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={3} />
          </Field>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">Cancel</Button>
          <Button onClick={submit} className="h-11">Add stock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  required,
  className,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
